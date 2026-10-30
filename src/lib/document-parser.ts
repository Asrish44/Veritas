/**
 * Universal Multi-Format Document Parser
 * Supports: .docx, .txt, .md, .pdf, .csv, .json, .html, and generic text formats.
 * Normalizes all documents into a uniform { pages: { page: number; text: string }[], nPages: number }
 * so the chunker, embedding model, and Qwen3-14B can analyze ANY document format seamlessly.
 */

import { extractPdf } from "./pdf";
import mammoth from "mammoth";

export interface ParsedDocument {
  pages: { page: number; text: string }[];
  nPages: number;
  fullText: string;
  format: string;
}

const CHARS_PER_PAGE = 1800; // standard virtual page size for linear text

/** Split continuous text into numbered pages based on headers, pagebreaks or char count */
export function paginateText(rawText: string): { page: number; text: string }[] {
  const clean = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!clean) return [];

  // 1. If explicit form-feed (\f) exists, split on it
  if (clean.includes("\f")) {
    const rawPages = clean.split("\f").map((p) => p.trim()).filter(Boolean);
    return rawPages.map((text, i) => ({ page: i + 1, text }));
  }

  // 2. Split on markdown headings or double paragraphs if large enough
  const paragraphs = clean.split(/\n\n+/);
  const pages: { page: number; text: string }[] = [];
  let currentPageText: string[] = [];
  let currentLength = 0;
  let pageNum = 1;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // Check if this is a major section title
    const isHeading = /^#{1,2}\s+/.test(trimmed) || /^[A-Z0-9\s]{4,40}$/.test(trimmed);

    if ((currentLength + trimmed.length > CHARS_PER_PAGE && currentPageText.length > 0) || (isHeading && currentLength > 800)) {
      pages.push({
        page: pageNum++,
        text: currentPageText.join("\n\n"),
      });
      currentPageText = [trimmed];
      currentLength = trimmed.length;
    } else {
      currentPageText.push(trimmed);
      currentLength += trimmed.length;
    }
  }

  if (currentPageText.length > 0) {
    pages.push({
      page: pageNum,
      text: currentPageText.join("\n\n"),
    });
  }

  return pages.length > 0 ? pages : [{ page: 1, text: clean }];
}

/** Parse any uploaded document buffer into pages and full text */
export async function parseDocument(fileName: string, buffer: Buffer): Promise<ParsedDocument> {
  const ext = fileName.toLowerCase().split(".").pop() || "";

  // 1. PDF
  if (ext === "pdf") {
    const pdfData = await extractPdf(buffer);
    return {
      pages: pdfData.pages,
      nPages: pdfData.nPages,
      fullText: pdfData.fullText,
      format: "PDF",
    };
  }

  // 2. DOCX / Word Document
  if (ext === "docx" || ext === "doc") {
    try {
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value.trim();
      const pages = paginateText(text);
      return {
        pages,
        nPages: pages.length,
        fullText: text,
        format: "DOCX",
      };
    } catch (docxErr) {
      console.warn("Mammoth DOCX extraction error, attempting raw string fallback:", docxErr);
    }
  }

  // 3. Markdown
  if (ext === "md" || ext === "markdown") {
    const text = buffer.toString("utf-8");
    const pages = paginateText(text);
    return {
      pages,
      nPages: pages.length,
      fullText: text,
      format: "MARKDOWN",
    };
  }

  // 4. Plain Text, Log, Code, TSV, CSV
  if (["txt", "text", "csv", "tsv", "log", "rtf"].includes(ext)) {
    const text = buffer.toString("utf-8");
    const pages = paginateText(text);
    return {
      pages,
      nPages: pages.length,
      fullText: text,
      format: ext.toUpperCase(),
    };
  }

  // 5. JSON
  if (ext === "json") {
    try {
      const raw = buffer.toString("utf-8");
      const obj = JSON.parse(raw);
      const formatted = JSON.stringify(obj, null, 2);
      const pages = paginateText(formatted);
      return {
        pages,
        nPages: pages.length,
        fullText: formatted,
        format: "JSON",
      };
    } catch {
      const raw = buffer.toString("utf-8");
      const pages = paginateText(raw);
      return { pages, nPages: pages.length, fullText: raw, format: "JSON" };
    }
  }

  // 6. HTML / XML
  if (["html", "htm", "xml"].includes(ext)) {
    const raw = buffer.toString("utf-8");
    // Strip tags for clean readable text
    const text = raw.replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
    const pages = paginateText(text);
    return {
      pages,
      nPages: pages.length,
      fullText: text,
      format: ext.toUpperCase(),
    };
  }

  // 7. General fallback for any file format
  try {
    const text = buffer.toString("utf-8");
    // Filter out binary garbage if non-printable
    const printableRatio = (text.slice(0, 1000).match(/[\x20-\x7E\t\n\r]/g) || []).length / Math.min(text.length, 1000);
    if (printableRatio > 0.75) {
      const pages = paginateText(text);
      return {
        pages,
        nPages: pages.length,
        fullText: text,
        format: ext ? ext.toUpperCase() : "TEXT",
      };
    }
  } catch {
    /* ignore */
  }

  throw new Error(`Unsupported or unreadable file format (.${ext}). Please upload DOCX, PDF, TXT, MD, CSV, or JSON.`);
}

