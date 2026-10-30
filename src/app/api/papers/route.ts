import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseDocument } from "@/lib/document-parser";
import { chunkPaper } from "@/lib/chunker";
import { embedTexts } from "@/lib/retriever";
import { createHash } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    const created: (
      | { name: string; error: string }
      | { id: string; name: string; title: string; pages: number; passages: number; embedded: number; format: string }
    )[] = [];
    const skipped: { name: string; reason: string }[] = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const hash = createHash("sha1").update(buffer).digest("hex");

      const existing = await db.paper.findUnique({ where: { hash } });
      if (existing) {
        skipped.push({ name: file.name, reason: "already uploaded" });
        continue;
      }

      let pages: { page: number; text: string }[] = [];
      let nPages = 0;
      let format = "DOCUMENT";
      try {
        const extraction = await parseDocument(file.name, buffer);
        pages = extraction.pages;
        nPages = extraction.nPages;
        format = extraction.format;
      } catch (e) {
        created.push({ name: file.name, error: `Document parse failed: ${e instanceof Error ? e.message : String(e)}` });
        continue;
      }

      const chunks = chunkPaper(hash, pages);
      if (chunks.length === 0) {
        created.push({ name: file.name, error: "No extractable text found in document." });
        continue;
      }

      const embeddings = await embedTexts(chunks.map((c) => c.text));

      const title = file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 180);

      const paper = await db.paper.create({
        data: {
          title,
          fileName: file.name,
          hash,
          pages: nPages,
          status: "UPLOADED",
          passages: {
            create: chunks.map((c, i) => ({
              ref: c.ref,
              page: c.page,
              ordinal: c.ordinal,
              section: c.section,
              text: c.text,
              embedding: embeddings && embeddings[i] ? JSON.stringify(embeddings[i]) : null,
            })),
          },
        },
        include: { passages: true },
      });

      created.push({
        id: paper.id,
        name: file.name,
        title: paper.title,
        pages: nPages,
        passages: chunks.length,
        embedded: embeddings ? chunks.length : 0,
        format,
      });
    }

    return NextResponse.json({ created, skipped });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function GET() {
  const papers = await db.paper.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { passages: true, claims: true } } },
  });
  return NextResponse.json({ papers });
}
