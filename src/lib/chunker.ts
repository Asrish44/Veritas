/**
 * Passage chunker — builds stable, citable passage IDs.
 *
 * A passage reference looks like:  a1b2c3d4::p2::c03
 * (8-char paper hash :: page :: chunk index on that page)
 * Every claim's evidence links back to one of these refs — Requirement 1.
 */

export interface Chunk {
  ref: string;
  page: number;
  ordinal: number;
  section: string;
  text: string;
}

const SECTION_HINTS: { re: RegExp; name: string }[] = [
  { re: /^abstract\b/im, name: "abstract" },
  { re: /^introduction\b/im, name: "introduction" },
  { re: /related work|background\b/im, name: "related-work" },
  { re: /^method|methodology|approach\b/im, name: "methods" },
  { re: /^experiment|evaluation|results\b/im, name: "results" },
  { re: /discussion\b/im, name: "discussion" },
  { re: /conclusion\b/im, name: "conclusion" },
  { re: /limitation\b/im, name: "limitations" },
  { re: /references\b/im, name: "references" },
];

function guessSection(text: string): string {
  const head = text.slice(0, 220);
  for (const h of SECTION_HINTS) {
    if (h.re.test(head)) return h.name;
  }
  return "body";
}

function normalize(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const TARGET = 950; // chars per passage (~230 tokens)
const OVERLAP = 180;
const HARD_MAX = 1500;

export function chunkPaper(hash: string, pages: { page: number; text: string }[]): Chunk[] {
  const chunks: Chunk[] = [];
  let ordinal = 0;

  for (const p of pages) {
    const text = normalize(p.text);
    if (text.length < 40) continue; // skip near-empty pages
    const paragraphs = text.split(/\n\n+/).flatMap((para) => {
      // split very long single-line paragraphs on sentence boundaries
      if (para.length <= TARGET) return [para];
      const sentences = para.split(/(?<=[.!?])\s+(?=[A-Z(])/);
      const out: string[] = [];
      let buf = "";
      for (const s of sentences) {
        if ((buf + " " + s).length > TARGET && buf.length > 0) {
          out.push(buf.trim());
          buf = s;
        } else {
          buf = buf ? buf + " " + s : s;
        }
      }
      if (buf.trim()) out.push(buf.trim());
      return out;
    });

    let buf = "";
    const flush = () => {
      const t = buf.trim();
      buf = "";
      if (t.length < 40) return;
      chunks.push({
        ref: `${hash.slice(0, 8)}::p${p.page}::c${String(ordinal).padStart(2, "0")}`,
        page: p.page,
        ordinal,
        section: guessSection(t),
        text: t.slice(0, HARD_MAX),
      });
      ordinal += 1;
    };

    for (const para of paragraphs) {
      if (buf.length === 0) {
        buf = para;
      } else if ((buf + "\n\n" + para).length <= TARGET) {
        buf = buf + "\n\n" + para;
      } else {
        // keep a tail overlap for continuity
        const tail = buf.slice(-OVERLAP);
        flush();
        buf = tail + "\n\n" + para;
      }
      if (buf.length >= TARGET) {
        const tail = buf.slice(-OVERLAP);
        flush();
        buf = tail;
      }
    }
    flush();
  }

  return chunks;
}
