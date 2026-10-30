import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");
  if (jobId) {
    const job = await db.job.findUnique({ where: { id: jobId } });
    if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 });
    return NextResponse.json({ job: { ...job, logs: JSON.parse(job.logs || "[]"), paperIds: JSON.parse(job.paperIds || "[]") } });
  }
  const job = await db.job.findFirst({ orderBy: { createdAt: "desc" } });
  if (!job) return NextResponse.json({ job: null });
  return NextResponse.json({ job: { ...job, logs: JSON.parse(job.logs || "[]"), paperIds: JSON.parse(job.paperIds || "[]") } });
}
