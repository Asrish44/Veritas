/**
 * Hybrid retrieval — Requirement 4.
 * Lexical: BM25 (local implementation).
 * Semantic: local embeddings via transformers.js (Xenova/bge-small-en-v1.5, runs on CPU, no API).
 * Fusion: Reciprocal Rank Fusion.
 * If the embedding model can't load (e.g. first-run download blocked), we degrade
 * gracefully to pure BM25 and surface that in the System tab.
 */

export interface RetrievalPassage {
  id: string;
  ref: string;
  page: number;
  section: string;
  paperId: string;
  paperTitle: string;
  text: string;
  embedding?: number[] | null;
}

const STOP = new Set(
  "a an the and or but if then than that this these those of in on at to for with by from as is are was were be been being it its we our us their they he she you your i not no nor so such can could may might will would should must do does did done have has had about into over under between across per each other more most less least very much many few using used use uses based paper study work propose proposed proposes present presented shows show shown suggest suggests found find results result approach method methods model models".split(
    " "
  )
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/* ------------------------------ BM25 ------------------------------ */

interface Bm25Index {
  df: Map<string, number>;
  tf: Map<string, number>[];
  docLen: number[];
  avgLen: number;
  n: number;
}

export function buildBm25(passages: RetrievalPassage[]): Bm25Index {
  const df = new Map<string, number>();
  const tf: Map<string, number>[] = [];
  const docLen: number[] = [];
  for (const p of passages) {
    const tokens = tokenize(p.text);
    docLen.push(tokens.length);
    const counts = new Map<string, number>();
    const seen = new Set<string>();
    for (const t of tokens) {
      counts.set(t, (counts.get(t) || 0) + 1);
      if (!seen.has(t)) {
        seen.add(t);
        df.set(t, (df.get(t) || 0) + 1);
      }
    }
    tf.push(counts);
  }
  const avgLen = docLen.reduce((a, b) => a + b, 0) / Math.max(docLen.length, 1);
  return { df, tf, docLen, avgLen, n: passages.length };
}

function bm25Scores(index: Bm25Index, queryTokens: string[]): number[] {
  const k1 = 1.4;
  const b = 0.75;
  const scores = new Array(index.n).fill(0);
  for (const term of queryTokens) {
    const dfTerm = index.df.get(term) || 0;
    if (dfTerm === 0) continue;
    const idf = Math.log(1 + (index.n - dfTerm + 0.5) / (dfTerm + 0.5));
    for (let i = 0; i < index.n; i++) {
      const f = index.tf[i].get(term) || 0;
      if (f === 0) continue;
      const denom = f + k1 * (1 - b + (b * index.docLen[i]) / index.avgLen);
      scores[i] += idf * ((f * (k1 + 1)) / denom);
    }
  }
  return scores;
}

/* --------------------------- Embeddings --------------------------- */

type EmbedFn = (texts: string[]) => Promise<number[][]>;

let embedFn: EmbedFn | null = null;
let embedLoading: Promise<EmbedFn | null> | null = null;
export let embeddingsAvailable = false;
export let embeddingsError = "";

async function loadEmbedder(): Promise<EmbedFn | null> {
  if (embedFn) return embedFn;
  if (embedLoading) return embedLoading;
  embedLoading = (async () => {
    try {
      const { pipeline } = await import("@xenova/transformers");
      const extractor = await pipeline("feature-extraction", "Xenova/bge-small-en-v1.5", { quantized: true });
      embeddingsAvailable = true;
      embedFn = async (texts: string[]) => {
        const out = await extractor(texts, { pooling: "mean", normalize: true });
        const vectors: number[][] = [];
        for (let i = 0; i < out.dims[0]; i++) {
          vectors.push(Array.from(out[i].data as Float32Array));
        }
        return vectors;
      };
      return embedFn;
    } catch (e) {
      embeddingsAvailable = false;
      embeddingsError = e instanceof Error ? e.message : String(e);
      return null;
    }
  })();
  return embedLoading;
}

export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const fn = await loadEmbedder();
  if (!fn) return null;
  try {
    return await fn(texts);
  } catch (e) {
    embeddingsError = e instanceof Error ? e.message : String(e);
    embeddingsAvailable = false;
    embedFn = null;
    embedLoading = null;
    return null;
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/* --------------------------- Hybrid search --------------------------- */

export interface RetrievedPassage extends RetrievalPassage {
  score: number;
  bm25Rank: number | null;
  vecRank: number | null;
}

/**
 * Hybrid lexical + semantic retrieval with Reciprocal Rank Fusion.
 * Falls back to BM25-only when embeddings are unavailable.
 */
export async function hybridSearch(
  query: string,
  passages: RetrievalPassage[],
  topK = 5
): Promise<{ results: RetrievedPassage[]; semantic: boolean }> {
  if (passages.length === 0) return { results: [], semantic: false };

  const qTokens = tokenize(query);
  const lexScores = bm25Scores(buildBm25(passages), qTokens);
  const lexOrder = passages
    .map((_, i) => i)
    .sort((a, b2) => lexScores[b2] - lexScores[a])
    .filter((i) => lexScores[i] > 0);
  const lexRank = new Map<number, number>();
  lexOrder.forEach((idx, r) => lexRank.set(idx, r + 1));

  let vecRank = new Map<number, number>();
  let semantic = false;
  const withVectors = passages.some((p) => p.embedding && p.embedding.length > 0);
  if (withVectors) {
    const qVec = await embedTexts([query]);
    if (qVec && qVec[0]) {
      semantic = true;
      const sims = passages.map((p, i) => ({
        i,
        s: p.embedding ? cosine(qVec[0], p.embedding) : -2,
      }));
      const order = sims
        .filter((x) => x.s > -1)
        .sort((a, b2) => b2.s - a.s)
        .slice(0, 40);
      vecRank = new Map(order.map((x, r) => [x.i, r + 1]));
    }
  }

  const K = 60;
  const fused = new Map<number, number>();
  const allIdx = new Set<number>([...lexRank.keys(), ...vecRank.keys()]);
  for (const i of allIdx) {
    let score = 0;
    const lr = lexRank.get(i);
    const vr = vecRank.get(i);
    if (lr) score += 1 / (K + lr);
    if (vr) score += 1 / (K + vr);
    fused.set(i, score);
  }

  const results = [...fused.entries()]
    .sort((a, b2) => b2[1] - a[1])
    .slice(0, topK)
    .map(([i, score]) => ({
      ...passages[i],
      score,
      bm25Rank: lexRank.get(i) ?? null,
      vecRank: vecRank.get(i) ?? null,
    }));

  return { results, semantic };
}
