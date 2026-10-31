import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const paper = await db.paper.findUnique({
    where: { id },
    include: {
      passages: { orderBy: { ordinal: "asc" } },
      claims: { orderBy: { position: "asc" } },
    },
  });
  if (!paper) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    paper: {
      ...paper,
      extraction: paper.extraction ? JSON.parse(paper.extraction) : null,
    },
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await db.claim.deleteMany({ where: { paperId: id } });
    await db.passage.deleteMany({ where: { paperId: id } });
    await db.paper.deleteMany({ where: { id } });

    return NextResponse.json({ ok: true, success: true, deleted: id });
  } catch (err) {
    console.error("DELETE paper error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
