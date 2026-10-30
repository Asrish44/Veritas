import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const classification = searchParams.get("classification") || undefined;
  const paperId = searchParams.get("paperId") || undefined;
  const q = searchParams.get("q") || undefined;

  const claims = await db.claim.findMany({
    where: {
      ...(classification && classification !== "ALL" ? { classification } : {}),
      ...(paperId && paperId !== "ALL" ? { OR: [{ paperId }, { sourceDoc: { contains: paperId } }] } : {}),
      ...(q ? { text: { contains: q } } : {}),
    },
    include: { paper: { select: { title: true } } },
    orderBy: [{ paperId: "asc" }, { position: "asc" }],
    take: 300,
  });

  const counts = {
    all: await db.claim.count(),
    supported: await db.claim.count({ where: { classification: "SUPPORTED" } }),
    contradicted: await db.claim.count({ where: { classification: "CONTRADICTED" } }),
    unresolved: await db.claim.count({ where: { classification: "UNRESOLVED" } }),
    downgraded: await db.claim.count({ where: { gateStatus: "DOWNGRADED" } }),
  };

  return NextResponse.json({ claims, counts });
}
