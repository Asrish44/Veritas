/**
 * LLM provider layer — 100% local.
 *
 * Talks to a local Ollama server (OpenAI-free, no API keys) running Qwen3-14B.
 * If Ollama is not reachable, the effective provider falls back to a
 * deterministic local "mock" engine so the full pipeline (retrieval, gates,
 * UI) can still be exercised. No external API is ever called.
 */

export type LlmProvider = "ollama" | "mock";

export interface LlmConfig {
  baseUrl: string;
  model: string;
  requested: "auto" | "ollama" | "mock";
}

export function getLlmConfig(): LlmConfig {
  return {
    baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    model: process.env.OLLAMA_MODEL || "qwen3:14b",
    requested: (process.env.LLM_PROVIDER as "auto" | "ollama" | "mock") || "auto",
  };
}

let cachedPing: { at: number; reachable: boolean; models: string[] } | null = null;

export async function pingOllama(force = false): Promise<{ reachable: boolean; models: string[] }> {
  if (!force && cachedPing && Date.now() - cachedPing.at < 8000) {
    return { reachable: cachedPing.reachable, models: cachedPing.models };
  }
  const { baseUrl } = getLlmConfig();
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = (await res.json()) as { models?: { name?: string }[] };
    const models = (data.models || []).map((m) => m.name || "").filter(Boolean);
    cachedPing = { at: Date.now(), reachable: true, models };
    return { reachable: true, models };
  } catch {
    cachedPing = { at: Date.now(), reachable: false, models: [] };
    return { reachable: false, models: [] };
  }
}

export async function getEffectiveProvider(): Promise<LlmProvider> {
  const cfg = getLlmConfig();
  if (cfg.requested === "mock") return "mock";
  if (cfg.requested === "ollama") return "ollama";
  const { reachable, models } = await pingOllama();
  if (!reachable) return "mock";
  const base = cfg.model.split(":")[0].toLowerCase();
  const found = models.some((m) => m.toLowerCase() === cfg.model.toLowerCase() || m.toLowerCase().startsWith(base));
  return found ? "ollama" : "mock";
}

/** Strip Qwen3 <think>…</think> blocks and code fences, then pull out the JSON object. */
export function extractJson(raw: string): unknown {
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  text = text.replace(/```(?:json)?/gi, "").trim();
  const start = text.indexOf("{");
  if (start === -1) throw new Error("no JSON object found in model output");
  // walk to the matching closing brace
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === "\\") {
      esc = true;
      continue;
    }
    if (ch === '"') inStr = !inStr;
    if (inStr) continue;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        return JSON.parse(candidate);
      }
    }
  }
  throw new Error("unbalanced JSON in model output");
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  contextWindow?: number;
}

export interface ChatResult<T> {
  data: T;
  provider: LlmProvider;
  model: string;
  raw?: string;
}

/**
 * Ask the local Qwen3-14B for a strict-JSON answer.
 * Uses Ollama's native /api/chat with format:"json" and think:false.
 */
export async function chatJson<T>(system: string, user: string, opts: ChatOptions = {}): Promise<ChatResult<T> | null> {
  const cfg = getLlmConfig();
  const body = {
    model: cfg.model,
    messages: [
      { role: "system", content: `${system}\n\nAnswer with a single valid JSON object and nothing else. /no_think` },
      { role: "user", content: user },
    ],
    stream: false,
    format: "json",
    think: false,
    options: {
      temperature: opts.temperature ?? 0.1,
      num_ctx: opts.contextWindow ?? 8192,
      num_predict: opts.maxTokens ?? 1400,
    },
  };
  const res = await fetch(`${cfg.baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text().catch(() => "")}`.slice(0, 300));
  const data = (await res.json()) as { message?: { content?: string } };
  const raw = data.message?.content || "";
  const parsed = extractJson(raw) as T;
  return { data: parsed, provider: "ollama", model: cfg.model, raw };
}
