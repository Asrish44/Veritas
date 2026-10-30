import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const papers = await db.paper.findMany({
    where: { status: { in: ["READY", "PROCESSING"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, summary: true, extraction: true },
  });

  const comparisons = await db.comparison.findMany({ orderBy: { createdAt: "asc" } });

  return NextResponse.json({
    papers: papers.map((p) => ({ ...p, extraction: p.extraction ? JSON.parse(p.extraction) : null })),
    comparisons: comparisons.map((c) => ({
      id: c.id,
      titleA: c.titleA,
      titleB: c.titleB,
      paperAId: c.paperAId,
      paperBId: c.paperBId,
      ...(JSON.parse(c.content) as { comparison: string; matrix: unknown[]; directions: unknown[] }),
    })),
  });
}
