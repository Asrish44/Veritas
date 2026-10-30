/**
 * PDF text extraction — page by page, pure local (pdf-parse v2, no services).
 */

export interface PageText {
  page: number;
  text: string;
}

export interface PdfExtraction {
  pages: PageText[];
  nPages: number;
  fullText: string;
}

export async function extractPdf(buffer: Buffer): Promise<PdfExtraction> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const pages: PageText[] = (result.pages || []).map((p) => ({
      page: p.num,
      text: (p.text || "").trim(),
    }));
    const nPages = result.total || pages.length;
    const fullText =
      result.text && result.text.trim().length > 0
        ? result.text
        : pages
            .map((p) => p.text)
            .join("\n\n");
    return { pages, nPages, fullText };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}
