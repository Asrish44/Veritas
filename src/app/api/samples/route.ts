import { NextResponse } from "next/server";
import { readFile, readdir } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { extractPdf } from "@/lib/pdf";
import { chunkPaper } from "@/lib/chunker";
import { embedTexts } from "@/lib/retriever";
import { createHash } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Loads the bundled sample papers through the exact same ingest path as uploads. */
export async function POST() {
  try {
    const dir = path.join(process.cwd(), "samples");
    let files: string[] = [];
    try {
      files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith(".pdf"));
    } catch {
      return NextResponse.json({ error: "samples folder not found" }, { status: 404 });
    }
    if (files.length === 0) return NextResponse.json({ error: "no sample PDFs bundled" }, { status: 404 });

    const created: { id: string; name: string; passages: number }[] = [];
    const skipped: { name: string; reason: string }[] = [];

    for (const name of files) {
      const buffer = await readFile(path.join(dir, name));
      const hash = createHash("sha1").update(buffer).digest("hex");
      if (await db.paper.findUnique({ where: { hash } })) {
        skipped.push({ name, reason: "already loaded" });
        continue;
      }
      const extraction = await extractPdf(buffer);
      const chunks = chunkPaper(hash, extraction.pages);
      if (chunks.length === 0) {
        skipped.push({ name, reason: "no extractable text" });
        continue;
      }
      const embeddings = await embedTexts(chunks.map((c) => c.text));
      const paper = await db.paper.create({
        data: {
          title: name.replace(/\.pdf$/i, "").replace(/[-_]/g, " ").slice(0, 180),
          fileName: name,
          hash,
          pages: extraction.nPages,
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
      });
      created.push({ id: paper.id, name, passages: chunks.length });
    }

    return NextResponse.json({ created, skipped });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
