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
  const { id } = await ctx.params;
  await db.claim.deleteMany({ where: { paperId: id } });
  await db.paper.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
