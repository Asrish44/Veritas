/**
 * Pipeline orchestrator — the full flow:
 *   ingest (done at upload) → extract → summarise → compare → split claims
 *   → hybrid retrieval → LLM verification → code validation gate → taxonomy
 * Progress is persisted to the Job row and polled by the dashboard.
 */

import { randomUUID } from "crypto";
import { db } from "./db";
import { hybridSearch, embedTexts, type RetrievalPassage } from "./retriever";
import { runGate, type GatePassage, type VerifierOutput } from "./gate";
import { comparePapers, extractElements, explainContradiction, splitClaims, summarizePaper, verifyClaim, type PaperExtraction } from "./tasks";
import { getEffectiveProvider } from "./llm";

interface LogLine {
  t: string;
  step: string;
  msg: string;
  level: "info" | "warn" | "error" | "ok";
}

const running = new Set<string>();

async function log(jobId: string, step: string, msg: string, level: LogLine["level"] = "info", progress?: number) {
  const line: LogLine = { t: new Date().toISOString().slice(11, 19), step, msg, level };
  const job = await db.job.findUnique({ where: { id: jobId } });
  const logs: LogLine[] = job ? (JSON.parse(job.logs || "[]") as LogLine[]) : [];
  logs.push(line);
  await db.job.update({
    where: { id: jobId },
    data: { step, logs: JSON.stringify(logs.slice(-250)), ...(progress !== undefined ? { progress } : {}) },
  });
}

export async function startJob(paperIds: string[]): Promise<string> {
  const job = await db.job.create({
    data: {
      id: randomUUID(),
      status: "RUNNING",
      step: "queued",
      paperIds: JSON.stringify(paperIds),
      logs: JSON.stringify([]),
    },
  });
  void runPipeline(job.id, paperIds).catch(async (e) => {
    await log(job.id, "failed", e instanceof Error ? e.message : String(e), "error");
    await db.job.update({ where: { id: job.id }, data: { status: "FAILED" } });
  });
  return job.id;
}

export function isJobRunning(jobId: string): boolean {
  return running.has(jobId);
}

async function runPipeline(jobId: string, paperIds: string[]) {
  if (running.has(jobId)) return;
  running.add(jobId);
  try {
    const provider = await getEffectiveProvider();
    await log(
      jobId,
      "start",
      provider === "ollama"
        ? "Answer engine ready — everything runs on this machine"
        : "Answer engine running in basic mode — everything stays on this machine",
      provider === "ollama" ? "ok" : "warn",
      2
    );

    const papers = await db.paper.findMany({ where: { id: { in: paperIds } }, include: { passages: true } });
    if (papers.length === 0) {
      await log(jobId, "abort", "no papers selected", "error");
      await db.job.update({ where: { id: jobId }, data: { status: "FAILED" } });
      return;
    }

    // ---- Stage 1: extract (Req 1) ----
    const extractions = new Map<string, PaperExtraction>();
    for (let i = 0; i < papers.length; i++) {
      const p = papers[i];
      await db.paper.update({ where: { id: p.id }, data: { status: "PROCESSING" } });
      await log(jobId, "extract", `[${i + 1}/${papers.length}] extracting key elements: ${p.title.slice(0, 60)}`, "info", 5 + Math.round((i / papers.length) * 15));
      const { data } = await extractElements(p.passages.map((x) => x.text).join("\n\n").slice(0, 12000), p.title);
      extractions.set(p.id, data);
      await db.paper.update({
        where: { id: p.id },
        data: { extraction: JSON.stringify(data), title: data.title?.slice(0, 180) || p.title },
      });
    }

    // ---- Stage 2: summarise (plain language, Req 1) ----
    const summaries = new Map<string, string>();
    for (let i = 0; i < papers.length; i++) {
      const p = papers[i];
      await log(jobId, "summarise", `[${i + 1}/${papers.length}] plain-language summary: ${p.title.slice(0, 60)}`, "info", 20 + Math.round((i / papers.length) * 12));
      const { data } = await summarizePaper(p.passages.map((x) => x.text).join("\n\n").slice(0, 10000), extractions.get(p.id)!);
      summaries.set(p.id, data.summary);
      await db.paper.update({ where: { id: p.id }, data: { summary: data.summary, status: "READY" } });
    }

    // ---- Stage 3: compare (Req 2) ----
    if (papers.length >= 2) {
      await log(jobId, "compare", `cross-paper comparison: ${papers.length} papers → C(n,2) = ${(papers.length * (papers.length - 1)) / 2} pairs`, "info", 34);
      for (let i = 0; i < papers.length; i++) {
        for (let j = i + 1; j < papers.length; j++) {
          const A = papers[i];
          const B = papers[j];
          const { data } = await comparePapers(
            { title: extractions.get(A.id)!.title, extraction: extractions.get(A.id)!, summary: summaries.get(A.id)! },
            { title: extractions.get(B.id)!.title, extraction: extractions.get(B.id)!, summary: summaries.get(B.id)! }
          );
          const existing = await db.comparison.findFirst({ where: { OR: [{ paperAId: A.id, paperBId: B.id }, { paperAId: B.id, paperBId: A.id }] } });
          if (existing) {
            await db.comparison.update({ where: { id: existing.id }, data: { content: JSON.stringify(data), titleA: extractions.get(A.id)!.title, titleB: extractions.get(B.id)!.title } });
          } else {
            await db.comparison.create({
              data: {
                paperAId: A.id,
                paperBId: B.id,
                titleA: extractions.get(A.id)!.title,
                titleB: extractions.get(B.id)!.title,
                content: JSON.stringify(data),
              },
            });
          }
          await log(jobId, "compare", `comparison saved: "${extractions.get(A.id)!.title.slice(0, 40)}" × "${extractions.get(B.id)!.title.slice(0, 40)}"`, "ok");
        }
      }
    }

    // ---- Stage 4: split claims (Req 3) — from every summary AND comparison ----
    interface ClaimDraft {
      text: string;
      position: number;
      sourceDoc: string;
      paperId: string | null;
      ctxPosition: number;
    }
    const drafts: ClaimDraft[] = [];
    for (let i = 0; i < papers.length; i++) {
      const p = papers[i];
      await log(jobId, "claims", `splitting summary into checkable claims: ${p.title.slice(0, 60)}`, "info", 38 + Math.round((i / papers.length) * 10));
      const { data } = await splitClaims(`summary of "${p.title}"`, summaries.get(p.id)!, {
        paperText: p.passages.map((x) => x.text).join(" ").slice(0, 8000),
        paperTitle: p.title,
      });
      for (const c of data.claims) {
        drafts.push({ text: c.text, position: c.position, sourceDoc: `summary:${p.id}`, paperId: p.id, ctxPosition: c.position });
      }
    }

    if (papers.length >= 2) {
      const comparisons = await db.comparison.findMany({ where: { OR: papers.flatMap((p) => [{ paperAId: p.id }, { paperBId: p.id }]) } });
      for (const comp of comparisons) {
        const parsed = JSON.parse(comp.content) as { comparison: string; matrix: { dimension: string; a: string; b: string }[] };
        const compText = [parsed.comparison, ...parsed.matrix.map((r) => `${r.dimension}: A — ${r.a}; B — ${r.b}`)].join("\n");
        const { data } = await splitClaims(`comparison "${comp.titleA}" × "${comp.titleB}"`, compText, {
          summaries: papers.map((p) => {
            const ex = extractions.get(p.id)!;
            return { title: ex.title, summary: summaries.get(p.id) || "", methodology: ex.methodology, keyFindings: ex.keyFindings, limitations: ex.limitations };
          }),
        });
        for (const c of data.claims) {
          drafts.push({ text: c.text, position: c.position, sourceDoc: `comparison:${comp.id}`, paperId: null, ctxPosition: c.position });
        }
      }
    }

    await log(jobId, "claims", `${drafts.length} atomic claims extracted from ${papers.length} summaries + ${papers.length >= 2 ? "comparisons" : "no comparisons"}`, "ok", 50);

    // ---- Stage 5: hybrid retrieval + verify + gate (Req 4 + 5) ----
    const allPassages: RetrievalPassage[] = papers.flatMap((p) =>
      p.passages.map((ps) => ({
        id: ps.id,
        ref: ps.ref,
        page: ps.page,
        section: ps.section,
        paperId: ps.paperId,
        paperTitle: extractions.get(p.id)?.title || p.title,
        text: ps.text,
        embedding: ps.embedding ? (JSON.parse(ps.embedding) as number[]) : null,
      }))
    );
    const semantic = allPassages.some((p) => p.embedding);
    await log(jobId, "retrieve", `index ready: ${allPassages.length} passages, hybrid=${semantic ? "BM25 + embeddings (RRF)" : "BM25 (lexical only)"}`, semantic ? "ok" : "warn", 52);

    let done = 0;
    for (const draft of drafts) {
      done++;
      const progress = 52 + Math.round((done / Math.max(drafts.length, 1)) * 42);
      const { results } = await hybridSearch(draft.text, allPassages, 5);
      const gatePassages: GatePassage[] = results.map((r) => ({ ref: r.ref, page: r.page, paperTitle: r.paperTitle, text: r.text }));

      const { data: verdict, provider: vp } = await verifyClaim(draft.text, results.map((r) => ({ ref: r.ref, page: r.page, paperTitle: r.paperTitle, text: r.text })), draft.ctxPosition);
      const gate = runGate(verdict as VerifierOutput, gatePassages);

      let taxonomy: string | null = null;
      let taxonomyNote: string | null = null;
      if (gate.classification === "CONTRADICTED" && gate.evidenceRef) {
        const otherPaper = allPassages.find((p) => p.paperId !== papers.find((pp) => pp.id === gate.evidenceRef?.split("::")[0])?.id && p.ref !== gate.evidenceRef && p.text.length > 100);
        const cited = allPassages.find((p) => p.ref === gate.evidenceRef);
        if (otherPaper && cited) {
          const { data } = await explainContradiction(
            draft.text,
            { ref: cited.ref, paperTitle: cited.paperTitle, text: cited.text },
            { ref: otherPaper.ref, paperTitle: otherPaper.paperTitle, text: otherPaper.text }
          );
          taxonomy = data.taxonomy;
          taxonomyNote = data.note;
        }
      }

      await db.claim.create({
        data: {
          paperId: draft.paperId,
          text: draft.text,
          position: draft.position,
          sourceDoc: draft.sourceDoc,
          classification: gate.classification,
          evidenceRef: gate.evidenceRef,
          evidenceText: gate.evidenceText,
          evidencePage: gate.evidencePage,
          evidencePaper: gate.evidencePaper,
          quote: gate.quote,
          justification: gate.justification,
          gateStatus: gate.gateStatus,
          gateReason: gate.gateReason,
          taxonomy,
          taxonomyNote,
          model: vp === "ollama" ? "grounded-engine" : "extractive-engine",
        },
      });

      if (done % 3 === 0 || done === drafts.length) {
        await log(jobId, "verify", `[${done}/${drafts.length}] "${draft.text.slice(0, 58)}…" → ${gate.classification}${gate.gateStatus === "DOWNGRADED" ? " (gate: " + gate.gateReason + ")" : ""}`, gate.gateStatus === "DOWNGRADED" ? "warn" : "info", progress);
      } else {
        await db.job.update({ where: { id: jobId }, data: { progress } });
      }
    }

    const counts = {
      supported: await db.claim.count({ where: { classification: "SUPPORTED", sourceDoc: { not: "pending" } } }),
      contradicted: await db.claim.count({ where: { classification: "CONTRADICTED" } }),
      unresolved: await db.claim.count({ where: { classification: "UNRESOLVED" } }),
    };
    await log(
      jobId,
      "done",
      `run complete — ${counts.supported} supported · ${counts.contradicted} contradicted · ${counts.unresolved} unresolved`,
      "ok",
      100
    );
    await db.job.update({ where: { id: jobId }, data: { status: "DONE", step: "done", progress: 100 } });
  } finally {
    running.delete(jobId);
  }
}
