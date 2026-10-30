import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEffectiveProvider } from "@/lib/llm";

export const runtime = "nodejs";

/**
 * Minimal status endpoint for the UI: whether the answer engine is ready
 * and how much is indexed. Deliberately exposes nothing about the setup —
 * no engine names, endpoints or configuration.
 */
export async function GET() {
  const provider = await getEffectiveProvider();

  const [papers, passages, claims] = await Promise.all([
    db.paper.count(),
    db.passage.count(),
    db.claim.count(),
  ]);

  return NextResponse.json({
    ready: provider === "ollama",
    store: { papers, passages, claims },
  });
}
