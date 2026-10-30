/**
 * The Validation Gate — Requirement 5 + the brief's code-validation protocol.
 *
 * Every verifier answer is checked IN CODE, never trusted:
 *   1. classification must be one of the three allowed labels
 *   2. the cited passage ref must exist in the retrieved evidence set
 *   3. if the claim is marked SUPPORTED / CONTRADICTED, the quoted span
 *      must actually be findable in that passage's text (exact or fuzzy)
 * Anything that fails is DOWNGRADED to UNRESOLVED with a machine reason —
 * "a confidence response must never count as evidence of correctness".
 */

export interface GatePassage {
  ref: string;
  page: number;
  paperTitle: string;
  text: string;
}

export interface VerifierOutput {
  passage_ref: string | null;
  classification: string;
  quote: string | null;
  justification: string;
}

export interface GateResult {
  classification: "SUPPORTED" | "CONTRADICTED" | "UNRESOLVED";
  evidenceRef: string | null;
  evidenceText: string | null;
  evidencePage: number | null;
  evidencePaper: string | null;
  quote: string | null;
  justification: string;
  gateStatus: "PASS" | "DOWNGRADED";
  gateReason: string | null;
}

const ALLOWED = new Set(["SUPPORTED", "CONTRADICTED", "UNRESOLVED"]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text: string): string[] {
  return normalize(text).split(" ").filter(Boolean);
}

/** Locate `quote` inside `text`; tolerant to whitespace/punctuation drift. Returns the best original-text span or null. */
export function findQuote(quote: string, text: string): string | null {
  if (!quote || !text) return null;
  const q = quote.trim();
  if (text.includes(q)) return q;

  const nText = normalize(text);
  const nQuote = normalize(q);
  if (nQuote && nText.includes(nQuote)) return q;

  // token-level sliding window with Jaccard similarity
  const qTokens = tokens(q);
  if (qTokens.length < 4) return null;
  const tTokens = tokens(text);
  const window = qTokens.length;
  const qSet = new Set(qTokens);
  let best: { score: number; start: number } | null = null;
  for (let i = 0; i + window <= tTokens.length; i++) {
    const slice = tTokens.slice(i, i + window);
    const sSet = new Set(slice);
    let inter = 0;
    for (const t of qSet) if (sSet.has(t)) inter++;
    const union = new Set([...qSet, ...slice]).size;
    const jaccard = inter / union;
    if (!best || jaccard > best.score) best = { score: jaccard, start: i };
  }
  if (best && best.score >= 0.62) {
    // reconstruct the original substring between the matched token bounds
    const bounds: { start: number; end: number }[] = [];
    const re = /[A-Za-z0-9]+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) bounds.push({ start: m.index, end: m.index + m[0].length });
    if (best.start < bounds.length) {
      const from = bounds[best.start].start;
      const toIdx = Math.min(best.start + window - 1, bounds.length - 1);
      const to = bounds[toIdx].end;
      return text.slice(from, to).trim();
    }
  }
  return null;
}

export function runGate(output: VerifierOutput, passages: GatePassage[]): GateResult {
  const base: GateResult = {
    classification: "UNRESOLVED",
    evidenceRef: null,
    evidenceText: null,
    evidencePage: null,
    evidencePaper: null,
    quote: null,
    justification: output.justification || "",
    gateStatus: "DOWNGRADED",
    gateReason: null,
  };

  const label = (output.classification || "").toUpperCase();

  // 1. allowed labels only
  if (!ALLOWED.has(label)) {
    return { ...base, gateReason: `invalid classification "${output.classification}" — downgraded to UNRESOLVED` };
  }

  if (label === "UNRESOLVED") {
    return { ...base, classification: "UNRESOLVED", gateStatus: "PASS" };
  }

  // 2. cited passage must exist in the retrieved evidence set
  const cited = passages.find((p) => p.ref === output.passage_ref);
  if (!cited) {
    return {
      ...base,
      gateReason: `cited passage "${output.passage_ref || "none"}" is not in the retrieved evidence set — downgraded to UNRESOLVED`,
    };
  }

  // 3. the quote must be findable in the cited passage
  const found = findQuote(output.quote || "", cited.text);
  if (!found) {
    return {
      ...base,
      gateReason: "quoted span not found in the cited passage — downgraded to UNRESOLVED",
      evidenceRef: cited.ref,
      evidenceText: cited.text,
      evidencePage: cited.page,
      evidencePaper: cited.paperTitle,
    };
  }

  return {
    classification: label as GateResult["classification"],
    evidenceRef: cited.ref,
    evidenceText: cited.text,
    evidencePage: cited.page,
    evidencePaper: cited.paperTitle,
    quote: found,
    justification: output.justification || "",
    gateStatus: "PASS",
    gateReason: null,
  };
}
