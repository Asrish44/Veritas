import { NextResponse } from "next/server";
import { startJob } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { paperIds?: string[] };
    const paperIds = (body.paperIds || []).filter(Boolean);
    if (paperIds.length === 0) {
      return NextResponse.json({ error: "select at least one paper" }, { status: 400 });
    }
    const jobId = await startJob(paperIds);
    return NextResponse.json({ jobId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
