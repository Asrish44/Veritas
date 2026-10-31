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
    const res = await fetch(`${baseUrl}/api/tags`, {
      headers: {
        "ngrok-skip-browser-warning": "true",
        "User-Agent": "Veritas-Client/1.0",
      },
      signal: AbortSignal.timeout(5000),
    });
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
  if (start === -1) {
    return { answer: text, citations: [] };
  }
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
        try {
          return JSON.parse(candidate);
        } catch {
          return { answer: text, citations: [] };
        }
      }
    }
  }
  return { answer: text, citations: [] };
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
export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export async function chatJson<T>(
  system: string,
  user: string,
  opts: ChatOptions = {},
  history: ChatHistoryMessage[] = []
): Promise<ChatResult<T> | null> {
  const cfg = getLlmConfig();

  const historyMessages = (history || [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({
      role: m.role,
      content: m.content.trim().slice(0, 1500),
    }));

  const messages = [
    { role: "system", content: `${system}\n\nCRITICAL: Answer concisely in single JSON object. Output NO thought tokens or <think> tags. /no_think` },
    ...historyMessages,
    { role: "user", content: user },
  ];

  const body = {
    model: cfg.model,
    messages,
    stream: false,
    format: "json",
    keep_alive: "24h",
    options: {
      temperature: opts.temperature ?? 0.3,
      num_ctx: opts.contextWindow ?? 1536,
      num_predict: opts.maxTokens ?? 140,
    },
  };
  const isCloud = !!process.env.VERCEL || !cfg.baseUrl.includes("localhost");
  const timeoutMs = isCloud ? 8000 : 12000;
  const res = await fetch(`${cfg.baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
      "User-Agent": "Veritas-Client/1.0",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text().catch(() => "")}`.slice(0, 300));
  const data = (await res.json()) as { message?: { content?: string } };
  const raw = data.message?.content || "";
  const parsed = extractJson(raw) as T;
  return { data: parsed, provider: "ollama", model: cfg.model, raw };
}
