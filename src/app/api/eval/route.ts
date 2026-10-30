import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { findQuote } from "@/lib/gate";

export const runtime = "nodejs";

const LABELS = ["SUPPORTED", "CONTRADICTED", "UNRESOLVED"] as const;
type Label = (typeof LABELS)[number];

function metrics(labels: { expected: Label; got: Label | null }[]) {
  const perClass = LABELS.map((cls) => {
    const tp = labels.filter((l) => l.expected === cls && l.got === cls).length;
    const fp = labels.filter((l) => l.expected !== cls && l.got === cls).length;
    const fn = labels.filter((l) => l.expected === cls && l.got !== cls).length;
    const precision = tp + fp === 0 ? null : tp / (tp + fp);
    const recall = tp + fn === 0 ? null : tp / (tp + fn);
    const f1 = precision !== null && recall !== null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : null;
    return { cls, tp, fp, fn, precision, recall, f1 };
  });
  const accuracy = labels.length === 0 ? null : labels.filter((l) => l.expected === l.got).length / labels.length;
  return { perClass, accuracy };
}

export async function GET() {
  // labeling template: current claims with empty "expected" for the organizer's annotations
  const claims = await db.claim.findMany({
    orderBy: [{ paperId: "asc" }, { position: "asc" }],
    select: { id: true, text: true, classification: true, evidenceRef: true },
  });
  return NextResponse.json({
    template: claims.map((c) => ({ claimId: c.id, claimText: c.text, predicted: c.classification, expected: "" })),
    hint: 'Fill "expected" with SUPPORTED / CONTRADICTED / UNRESOLVED, then POST the array to /api/eval',
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { labels?: { claimId: string; expected: string }[] };
    const input = (body.labels || []).filter((l) => l && typeof l.claimId === "string");
    if (input.length === 0) {
      return NextResponse.json({ error: "labels array is empty — expected [{claimId, expected}]" }, { status: 400 });
    }

    const claims = await db.claim.findMany({ where: { id: { in: input.map((l) => l.claimId) } } });
    const byId = new Map(claims.map((c) => [c.id, c]));

    const paired: { expected: Label; got: Label | null }[] = [];
    const mismatches: { claimId: string; claimText: string; expected: string; predicted: string | null }[] = [];
    let matched = 0;

    for (const l of input) {
      const expected = (l.expected || "").toUpperCase() as Label;
      if (!LABELS.includes(expected)) continue;
      const claim = byId.get(l.claimId);
      const got = (claim?.classification as Label) || null;
      paired.push({ expected, got });
      matched++;
      if (got !== expected) {
        mismatches.push({ claimId: l.claimId, claimText: claim?.text || "(missing claim)", expected, predicted: got });
      }
    }

    if (matched === 0) {
      return NextResponse.json({ error: "no valid labels — expected values must be SUPPORTED / CONTRADICTED / UNRESOLVED" }, { status: 400 });
    }

    const { perClass, accuracy } = metrics(paired);

    // Source-link validity (Req 7): every non-UNRESOLVED verdict must cite a real
    // passage whose stored text actually contains the quoted span.
    const verified = claims.filter((c) => c.classification && c.classification !== "UNRESOLVED");
    let validLinks = 0;
    const brokenLinks: { claimId: string; reason: string }[] = [];
    for (const c of verified) {
      if (!c.evidenceRef || !c.evidenceText) {
        brokenLinks.push({ claimId: c.id, reason: "missing evidence reference" });
        continue;
      }
      const passage = await db.passage.findUnique({ where: { ref: c.evidenceRef } });
      if (!passage) {
        brokenLinks.push({ claimId: c.id, reason: `passage ${c.evidenceRef} does not exist in the index` });
        continue;
      }
      if (!c.quote || !findQuote(c.quote, passage.text)) {
        brokenLinks.push({ claimId: c.id, reason: `quoted span not found in ${c.evidenceRef}` });
        continue;
      }
      validLinks++;
    }

    const downgraded = claims.filter((c) => c.gateStatus === "DOWNGRADED").length;

    return NextResponse.json({
      evaluated: matched,
      accuracy,
      perClass,
      sourceLinkValidity: verified.length === 0 ? null : validLinks / verified.length,
      verifiedCount: verified.length,
      validLinks,
      brokenLinks: brokenLinks.slice(0, 20),
      gateDowngraded: downgraded,
      mismatches: mismatches.slice(0, 25),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
