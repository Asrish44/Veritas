/**
 * Pipeline stage functions (Requirement-mapped prompts for Qwen3-14B).
 * Each stage tries the local model first; if the provider is "mock",
 * the deterministic engine from mock.ts produces the equivalent output.
 */

import { chatJson, getEffectiveProvider, type LlmProvider } from "./llm";
import { mockClaims, mockCompare, mockContradiction, mockExtract, mockSummary, mockVerify, type MockCtx } from "./mock";

export interface PaperExtraction {
  title: string;
  objectives: string;
  methodology: string;
  keyFindings: string[];
  limitations: string[];
}

const JSON_ONLY = "Return ONLY a valid JSON object. No markdown, no commentary.";

export async function extractElements(paperText: string, fallbackTitle: string): Promise<{ data: PaperExtraction; provider: LlmProvider }> {
  const provider = await getEffectiveProvider();
  if (provider === "mock") {
    return { data: mockExtract(paperText, fallbackTitle), provider };
  }
  const system = `You extract the key elements of a research paper for a verification tool. Be faithful to the text; never invent numbers or findings. ${JSON_ONLY} Schema: {"title": string, "objectives": string (2-3 sentences, plain language), "methodology": string (2-4 sentences, plain language), "keyFindings": string[] (2-4 concrete findings, keep original numbers), "limitations": string[] (1-3 items stated by the authors)}`;
  const user = `Paper text (may be truncated):\n\n"""\n${paperText.slice(0, 9000)}\n"""\n\nFallback title if none found: "${fallbackTitle}"`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await chatJson<PaperExtraction>(system, user, { maxTokens: 1200 });
      if (res && res.data && typeof res.data.title === "string") {
        return {
          data: {
            title: res.data.title || fallbackTitle,
            objectives: res.data.objectives || "",
            methodology: res.data.methodology || "",
            keyFindings: Array.isArray(res.data.keyFindings) ? res.data.keyFindings.map(String) : [],
            limitations: Array.isArray(res.data.limitations) ? res.data.limitations.map(String) : [],
          },
          provider,
        };
      }
    } catch {
      /* retry */
    }
  }
  return { data: mockExtract(paperText, fallbackTitle), provider: "mock" };
}

export async function summarizePaper(paperText: string, extraction: PaperExtraction): Promise<{ data: { summary: string }; provider: LlmProvider }> {
  const provider = await getEffectiveProvider();
  if (provider === "mock") {
    return { data: mockSummary({ paperText, paperTitle: extraction.title }), provider };
  }
  const system = `You write plain-language summaries of research papers for students. Neutral tone, no embellishment, keep every number exactly as written. ${JSON_ONLY} Schema: {"summary": string} — 140-220 words, one paragraph.`;
  const user = `Extraction:\n${JSON.stringify(extraction, null, 2)}\n\nPaper text (may be truncated):\n"""\n${paperText.slice(0, 7000)}\n"""`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await chatJson<{ summary: string }>(system, user, { maxTokens: 700 });
      if (res && typeof res.data.summary === "string" && res.data.summary.length > 40) {
        return { data: { summary: res.data.summary }, provider };
      }
    } catch {
      /* retry */
    }
  }
  return { data: mockSummary({ paperText, paperTitle: extraction.title }), provider: "mock" };
}

export interface ComparisonMatrixRow {
  dimension: string;
  a: string;
  b: string;
}

export interface ComparisonResult {
  comparison: string;
  matrix: ComparisonMatrixRow[];
  directions: { title: string; groundedIn: string; note: string }[];
}

export async function comparePapers(
  a: { title: string; extraction: PaperExtraction; summary: string },
  b: { title: string; extraction: PaperExtraction; summary: string }
): Promise<{ data: ComparisonResult; provider: LlmProvider }> {
  const provider = await getEffectiveProvider();
  if (provider === "mock") {
    return {
      data: mockCompare([
        { title: a.title, summary: a.summary, methodology: a.extraction.methodology, keyFindings: a.extraction.keyFindings, limitations: a.extraction.limitations },
        { title: b.title, summary: b.summary, methodology: b.extraction.methodology, keyFindings: b.extraction.keyFindings, limitations: b.extraction.limitations },
      ]),
      provider,
    };
  }
  const system = `You compare exactly two research papers on methods, datasets, metrics, results and limitations. Only state what the extractions support. Research directions must be clearly framed as suggestions, never as findings. ${JSON_ONLY} Schema: {"comparison": string (1-2 paragraphs), "matrix": [{"dimension": "Methods"|"Datasets"|"Metrics"|"Results"|"Limitations", "a": string, "b": string}] (exactly these 5 rows), "directions": [{"title": string, "groundedIn": string, "note": string}] (1-3 items, note always mentions it is a suggestion)}`;
  const user = `Paper A: "${a.title}"\n${JSON.stringify(a.extraction)}\nSummary A: ${a.summary}\n\nPaper B: "${b.title}"\n${JSON.stringify(b.extraction)}\nSummary B: ${b.summary}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await chatJson<ComparisonResult>(system, user, { maxTokens: 1800 });
      if (res && Array.isArray(res.data.matrix) && res.data.matrix.length >= 3) {
        return {
          data: {
            comparison: res.data.comparison || "",
            matrix: res.data.matrix.map((r) => ({ dimension: String(r.dimension), a: String(r.a), b: String(r.b) })),
            directions: Array.isArray(res.data.directions)
              ? res.data.directions.map((d) => ({ title: String(d.title), groundedIn: String(d.groundedIn), note: String(d.note) }))
              : [],
          },
          provider,
        };
      }
    } catch {
      /* retry */
    }
  }
  return {
    data: mockCompare([
      { title: a.title, summary: a.summary, methodology: a.extraction.methodology, keyFindings: a.extraction.keyFindings, limitations: a.extraction.limitations },
      { title: b.title, summary: b.summary, methodology: b.extraction.methodology, keyFindings: b.extraction.keyFindings, limitations: b.extraction.limitations },
    ]),
    provider: "mock",
  };
}

export async function splitClaims(sourceLabel: string, docText: string, ctx?: MockCtx): Promise<{ data: { claims: { text: string; position: number }[] }; provider: LlmProvider }> {
  const provider = await getEffectiveProvider();
  if (provider === "mock") {
    return { data: mockClaims({ ...(ctx || {}), claimSource: sourceLabel }), provider };
  }
  const system = `You split a generated text into individually checkable atomic claims (Requirement 3). Each claim must be ONE verifiable statement of at most 40 words, keep original numbers, keep the original order, do not merge or invent content. ${JSON_ONLY} Schema: {"claims": [{"text": string, "position": integer}]}`;
  const user = `Source: ${sourceLabel}\n\nText to split:\n"""\n${docText.slice(0, 6000)}\n"""`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await chatJson<{ claims: { text: string; position: number }[] }>(system, user, { maxTokens: 1600 });
      if (res && Array.isArray(res.data.claims) && res.data.claims.length > 0) {
        return {
          data: {
            claims: res.data.claims
              .filter((c) => c && typeof c.text === "string" && c.text.trim().length > 8)
              .slice(0, 14)
              .map((c, i) => ({ text: c.text.trim(), position: typeof c.position === "number" ? c.position : i })),
          },
          provider,
        };
      }
    } catch {
      /* retry */
    }
  }
  return { data: mockClaims({ ...(ctx || {}), claimSource: sourceLabel }), provider: "mock" };
}

export interface VerifyPassage {
  ref: string;
  page: number;
  paperTitle: string;
  text: string;
}

export interface VerifyOutput {
  passage_ref: string | null;
  classification: string;
  quote: string | null;
  justification: string;
}

export async function verifyClaim(claimText: string, passages: VerifyPassage[], claimPosition = 0): Promise<{ data: VerifyOutput; provider: LlmProvider }> {
  const provider = await getEffectiveProvider();
  if (provider === "mock") {
    return { data: mockVerify({ claimText, passages, claimPosition }), provider };
  }
  const system = `You are a strict evidence verifier. You receive one claim and a numbered set of retrieved passages. Decide whether the evidence truly supports or contradicts the claim. Rules: cite exactly one passage by its ref, ONLY from the provided list; the quote must be copied VERBATIM (max 35 words) from that passage; if no passage genuinely supports or contradicts the claim, choose UNRESOLVED and set passage_ref to null. A passage that merely talks about the same topic is NOT support. Never guess. ${JSON_ONLY} Schema: {"passage_ref": string|null, "classification": "SUPPORTED"|"CONTRADICTED"|"UNRESOLVED", "quote": string|null, "justification": string (max 40 words)}`;
  const passageBlock = passages
    .map((p) => `[${p.ref}] (page ${p.page}, ${p.paperTitle})\n${p.text.slice(0, 700)}`)
    .join("\n\n---\n\n");
  const user = `Claim: "${claimText}"\n\nRetrieved passages:\n\n${passageBlock}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await chatJson<VerifyOutput>(system, user, { temperature: 0.0, maxTokens: 500, contextWindow: 8192 });
      if (res && res.data && typeof res.data.classification === "string") {
        return {
          data: {
            passage_ref: res.data.passage_ref ?? null,
            classification: res.data.classification,
            quote: res.data.quote ?? null,
            justification: res.data.justification ?? "",
          },
          provider,
        };
      }
    } catch {
      /* retry */
    }
  }
  return { data: mockVerify({ claimText, passages, claimPosition }), provider: "mock" };
}

export async function explainContradiction(
  claimText: string,
  passageA: { ref: string; paperTitle: string; text: string },
  passageB: { ref: string; paperTitle: string; text: string }
): Promise<{ data: { taxonomy: string; note: string }; provider: LlmProvider }> {
  const provider = await getEffectiveProvider();
  if (provider === "mock") {
    return { data: mockContradiction({ claimText }), provider };
  }
  const system = `Two passages disagree about one claim. Decide WHY (Requirement 6): different datasets, different metrics, different sample sizes/populations, different definitions, or a genuine scientific disagreement. ${JSON_ONLY} Schema: {"taxonomy": "REAL_DISAGREEMENT"|"DATASET_DIFF"|"METRIC_DIFF"|"SAMPLE_DIFF"|"DEFINITION_DIFF", "note": string (max 50 words, cite what differs)}`;
  const user = `Claim: "${claimText}"\n\nPassage from ${passageA.paperTitle} [${passageA.ref}]:\n${passageA.text.slice(0, 600)}\n\nPassage from ${passageB.paperTitle} [${passageB.ref}]:\n${passageB.text.slice(0, 600)}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await chatJson<{ taxonomy: string; note: string }>(system, user, { maxTokens: 300 });
      if (res && res.data && typeof res.data.taxonomy === "string") {
        return { data: { taxonomy: res.data.taxonomy.toUpperCase(), note: res.data.note || "" }, provider };
      }
    } catch {
      /* retry */
    }
  }
  return { data: mockContradiction({ claimText }), provider: "mock" };
}
