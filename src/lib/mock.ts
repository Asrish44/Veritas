/**
 * Deterministic mock engine — used ONLY when the local Qwen3-14B is unreachable.
 * No external API is involved; everything is derived from the uploaded paper text.
 * Its purpose: keep the whole pipeline (retrieval, gates, UI, eval) exercisable
 * before the model server is up, and provide a safe fallback during demos.
 * Every 6th claim deliberately returns a hallucinated quote so the Validation
 * Gate's downgrade path (Req 5) can be demonstrated.
 */

export interface MockCtx {
  paperText?: string;
  paperTitle?: string;
  summaries?: { title: string; summary: string; methodology: string; keyFindings: string[]; limitations: string[] }[];
  claimText?: string;
  passages?: { ref: string; page: number; paperTitle: string; text: string }[];
  claimPosition?: number;
  claimSource?: string;
}

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30);
}

function pick(re: RegExp, sents: string[], count: number): string[] {
  const hits = sents.filter((s) => re.test(s));
  return hits.slice(0, count);
}

export function mockExtract(paperText: string, fallbackTitle: string) {
  const sents = sentences(paperText);
  const firstLine =
    paperText
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 12 && l.length < 120) || fallbackTitle;
  const objectives = sents.slice(0, 2).join(" ") || "The paper's objectives could not be located in the extracted text.";
  const methodology =
    pick(/we (?:propose|present|introduce|design|evaluate|train)|method|approach|architecture|dataset/i, sents, 2).join(" ") ||
    sents.slice(2, 3).join(" ") ||
    "Methodology section not detected.";
  const keyFindings = pick(/\d+(?:\.\d+)?\s?%|improv|outperform|accuracy|f1|result/i, sents, 3);
  const limitations = pick(/limitation|however|fail|future work|small(er)?\s?(?:dataset|sample)|does not/i, sents, 2);
  return {
    title: firstLine,
    objectives,
    methodology: methodology || "Not explicitly stated in the extracted text.",
    keyFindings: keyFindings.length ? keyFindings : ["No explicit quantitative findings detected in the extracted text."],
    limitations: limitations.length ? limitations : ["No explicit limitations section detected in the extracted text."],
  };
}

export function mockSummary(ctx: MockCtx): { summary: string } {
  const text = ctx.paperText || "";
  const sents = sentences(text);
  const ex = mockExtract(text, ctx.paperTitle || "Paper");
  const summary =
    sents.length > 0
      ? `${sents.slice(0, 3).join(" ")} The work reports ${ex.keyFindings[0]?.toLowerCase() || "its main results"}; stated limitations include ${(ex.limitations[0] || "none discussed").toLowerCase()}`
      : "The extracted text was too short to summarise.";
  return { summary: summary.slice(0, 900) };
}

export function mockClaims(ctx: MockCtx): { claims: { text: string; position: number }[] } {
  const source = ctx.claimSource || "";
  const isComparison = source.startsWith("comparison");
  if (isComparison && ctx.summaries && ctx.summaries.length >= 2) {
    const [a, b] = ctx.summaries;
    const short = (t: string) => (t.split(/[:—-]/)[0] || t).trim().slice(0, 40);
    const dims: [string, string, string][] = [
      ["Methods", a.methodology, b.methodology],
      ["Datasets", "Dataset details follow each paper's methodology description.", "Dataset details follow each paper's methodology description."],
      ["Metrics", "Both papers report accuracy-style metrics.", "Both papers report accuracy-style metrics."],
      ["Results", a.keyFindings[0] || "", b.keyFindings[0] || ""],
      ["Limitations", a.limitations[0] || "", b.limitations[0] || ""],
    ];
    const claims: { text: string; position: number }[] = [];
    dims.forEach(([dim, av, bv], i) => {
      if (av) claims.push({ text: `On ${dim.toLowerCase()}, ${short(a.title)}: ${av.slice(0, 160)}`, position: claims.length });
      if (bv) claims.push({ text: `On ${dim.toLowerCase()}, ${short(b.title)}: ${bv.slice(0, 160)}`, position: claims.length });
      void i;
    });
    return { claims: claims.slice(0, 8) };
  }
  const text = ctx.paperText || "";
  const sents = sentences(text).slice(0, 10);
  const claims = sents
    .filter((s) => /\d|propose|present|show|report|achiev|improv|outperform|limitation|dataset|method/i.test(s))
    .slice(0, 7)
    .map((s, i) => ({ text: s.length > 240 ? s.slice(0, 237) + "…" : s, position: i }));
  return { claims: claims.length ? claims : [{ text: "The document contains no clearly checkable claims.", position: 0 }] };
}

/** Deterministic verifier: best lexical-overlap passage wins; every 6th claim hallucinates a quote. */
export function mockVerify(ctx: MockCtx) {
  const claim = ctx.claimText || "";
  const passages = ctx.passages || [];
  const claimTokens = new Set(
    claim
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 3)
  );
  let best: { ref: string; page: number; paperTitle: string; text: string; overlap: number } | null = null;
  for (const p of passages) {
    const tokens = p.text.toLowerCase().split(/\W+/);
    const set = new Set(tokens);
    let inter = 0;
    for (const t of claimTokens) if (set.has(t)) inter++;
    const overlap = inter / Math.max(claimTokens.size, 1);
    if (!best || overlap > best.overlap) best = { ...p, overlap };
  }

  // deliberate hallucination path (demonstrates the validation gate)
  if ((ctx.claimPosition || 0) % 6 === 5) {
    return {
      passage_ref: best ? best.ref : null,
      classification: "SUPPORTED",
      quote: "This exact sentence was fabricated by the model and appears nowhere in the paper.",
      justification: "Looks supported (simulated confidence high).",
    };
  }

  if (!best || best.overlap < 0.12) {
    return {
      passage_ref: null,
      classification: "UNRESOLVED",
      quote: null,
      justification: "No retrieved passage contains sufficient evidence for this claim (simulated low confidence).",
    };
  }

  // find the sentence in the passage with the highest overlap → verbatim quote
  const sents = sentences(best.text);
  let q = sents[0] || best.text.slice(0, 160);
  let qBest = 0;
  for (const s of sents) {
    const st = new Set(s.toLowerCase().split(/\W+/));
    let inter = 0;
    for (const t of claimTokens) if (st.has(t)) inter++;
    const sc = inter / Math.max(claimTokens.size, 1);
    if (sc > qBest) {
      qBest = sc;
      q = s;
    }
  }

  // numeric conflict → contradiction
  const claimNums = claim.match(/\d+(?:\.\d+)?\s?%/g) || [];
  const passageNums = best.text.match(/\d+(?:\.\d+)?\s?%/g) || [];
  if (claimNums.length && passageNums.length) {
    const c = parseFloat(claimNums[0] ?? "");
    const p = parseFloat(passageNums[0] ?? "");
    if (!isNaN(c) && !isNaN(p) && Math.abs(c - p) > 1.5) {
      return {
        passage_ref: best.ref,
        classification: "CONTRADICTED",
        quote: passageNums[0] ? best.text.split(passageNums[0])[0].slice(-140) + passageNums[0] : q,
        justification: `The claim reports ${claimNums[0]} while the cited passage reports ${passageNums[0]} (simulated check).`,
      };
    }
  }

  const label = qBest >= 0.25 ? "SUPPORTED" : "UNRESOLVED";
  return {
    passage_ref: label === "SUPPORTED" ? best.ref : null,
    classification: label,
    quote: label === "SUPPORTED" ? q : null,
    justification:
      label === "SUPPORTED"
        ? "The cited passage directly states the claimed result (simulated lexical grounding)."
        : "Retrieved passages are related but do not state the claim explicitly (simulated).",
  };
}

export function mockContradiction(ctx: MockCtx) {
  const claim = (ctx.claimText || "").toLowerCase();
  if (/dataset|corpus|benchmark/.test(claim)) {
    return { taxonomy: "DATASET_DIFF", note: "The two papers appear to evaluate on different datasets (simulated analysis)." };
  }
  if (/f1|accuracy|bleu|metric|score/.test(claim)) {
    return { taxonomy: "METRIC_DIFF", note: "The disagreement likely stems from different evaluation metrics (simulated analysis)." };
  }
  if (/sample|participants|subjects|users/.test(claim)) {
    return { taxonomy: "SAMPLE_DIFF", note: "Different sample sizes or populations may explain the gap (simulated analysis)." };
  }
  if (/define|definition|term/.test(claim)) {
    return { taxonomy: "DEFINITION_DIFF", note: "The papers may use differing definitions of the key term (simulated analysis)." };
  }
  return { taxonomy: "REAL_DISAGREEMENT", note: "No procedural difference detected — this looks like a genuine disagreement between the papers (simulated analysis)." };
}

export function mockCompare(summaries: MockCtx["summaries"]) {
  const list = summaries || [];
  const [a, b] = list;
  const matrix = [
    {
      dimension: "Methods",
      a: a?.methodology || "—",
      b: b?.methodology || "—",
    },
    {
      dimension: "Datasets",
      a: "See methods row — dataset named within the methodology description.",
      b: "See methods row — dataset named within the methodology description.",
    },
    {
      dimension: "Metrics",
      a: "Accuracy-style metrics reported in the findings.",
      b: "Accuracy-style metrics reported in the findings.",
    },
    {
      dimension: "Results",
      a: a?.keyFindings[0] || "—",
      b: b?.keyFindings[0] || "—",
    },
    {
      dimension: "Limitations",
      a: a?.limitations[0] || "—",
      b: b?.limitations[0] || "—",
    },
  ];
  const comparison = list
    .map((p) => `**${p.title}** — ${p.summary}`)
    .join("\n\n")
    .slice(0, 2400);
  const directions = [
    {
      title: "Run both approaches on one shared benchmark",
      groundedIn: "The papers evaluate under different dataset/metric conditions.",
      note: "Suggestion, not a finding — derived from the comparison matrix above.",
    },
    {
      title: "Ablate the efficiency component in isolation",
      groundedIn: "Reported gains conflate multiple design changes.",
      note: "Suggestion, not a finding — derived from the methods row.",
    },
  ];
  return { comparison, matrix, directions };
}
