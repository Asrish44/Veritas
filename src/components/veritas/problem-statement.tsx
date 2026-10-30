"use client";

import { useState } from "react";
import { ChevronDown, FileText } from "lucide-react";

/**
 * ProblemStatement — the hackathon brief, rendered as a collapsible
 * welcome card inside the chat box. Collapsed it stays out of the way;
 * expanded it shows the full problem, requirements and how this build
 * satisfies them.
 */

const REQUIREMENTS = [
  "Accept research papers as PDFs and assign each paper and passage a stable identifier, such as a paper ID plus a page or section reference. Extract each paper's objectives, methodology, key findings and limitations in plain, understandable language.",
  "Compare at least two papers on a common topic, covering methods, datasets, metrics, results and limitations.",
  "Split every generated summary and comparison into individually checkable claims, keeping each claim's position in the original output.",
  "Retrieve relevant passages for each claim using lexical, semantic or hybrid retrieval. Classify each claim as supported, contradicted or unresolved, and show the exact source passage and paper identifier for each.",
  "Prevent a claim from being marked supported just because a related paper or section exists. Claims without adequate evidence must be flagged as unresolved.",
  "For apparent contradictions between papers, explain whether they are real disagreements or come from different conditions, such as different datasets, metrics, sample sizes or definitions.",
  "Evaluate the assistant on the organizer-provided labelled test set. Report claim-level precision and recall, source-link validity, and examples of wrong or inconclusive assessments.",
];

export function ProblemStatement() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 py-1">
      <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-950/60 text-left shadow-lg shadow-emerald-950/10">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-start gap-3 p-4 text-left sm:p-5"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600/10 ring-1 ring-emerald-500/30">
            <FileText className="h-4 w-4 text-emerald-400" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/5 px-2 py-0.5 font-mono text-[9.5px] tracking-wide text-emerald-300">
                ResearchTech · Retrieval Systems & Information Integrity
              </span>
              <span className="rounded-full border border-slate-700 px-2 py-0.5 font-mono text-[9.5px] tracking-wide text-slate-400">
                BEGINNER
              </span>
            </span>
            <span className="mt-2 block text-sm font-semibold leading-snug text-slate-100">
              AI Research Assistant for Verifiable Summaries & Cross-Paper Synthesis
            </span>
            <span className="mt-1.5 block text-xs leading-relaxed text-slate-400">
              Every statement the tool produces is treated as something to{" "}
              <span className="font-medium text-emerald-300">verify</span>, not something to trust.
            </span>
          </span>
          <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="space-y-4 border-t border-slate-800/80 px-4 py-4 text-xs leading-relaxed text-slate-400 sm:px-5">
            <section>
              <p>
                Students and early-career researchers spend a lot of time working through long papers and figuring out
                how studies relate to each other. Many don&apos;t have a supervisor or senior colleague to check
                whether they&apos;ve understood a paper correctly. AI summaries look like an obvious fix, but they
                bring a quieter problem. They can sound fluent while misreporting a number, mixing up which paper said
                what, or citing a paper that doesn&apos;t actually support the claim. When a summary has ten correct
                statements and one wrong one, a student is unlikely to catch it.
              </p>
              <p className="mt-2.5">
                Build a tool that lets users upload papers, extracts their key elements, and compares them. Every
                statement the tool produces should then be treated as something to verify, not something to trust. The
                tool splits each summary and comparison into individual claims. It retrieves the relevant passages from
                the uploaded papers and labels each claim as{" "}
                <span className="text-emerald-300">supported</span>,{" "}
                <span className="text-rose-300">contradicted</span> or{" "}
                <span className="text-amber-300">unresolved</span>. The link between each claim and its evidence must
                stay visible to the user.
              </p>
              <p className="mt-2.5">
                The central technical challenge is moving from &ldquo;this paper is relevant&rdquo; to &ldquo;this
                specific sentence in this paper supports this specific claim.&rdquo; A confident model response must
                never count as evidence of correctness.
              </p>
            </section>

            <section>
              <h4 className="font-mono text-[10px] font-semibold uppercase tracking-widest text-slate-500">Requirements</h4>
              <ol className="mt-2 list-decimal space-y-1.5 pl-4 marker:text-emerald-500/70">
                {REQUIREMENTS.map((r) => (
                  <li key={r.slice(0, 24)}>{r}</li>
                ))}
              </ol>
            </section>

            <section>
              <h4 className="font-mono text-[10px] font-semibold uppercase tracking-widest text-slate-500">Bonus</h4>
              <p className="mt-2">
                A research comparison matrix where every cell links to its source passage, and suggested unexplored
                directions. Each direction must be grounded in stated limitations or gaps across the papers and clearly
                marked as a suggestion, not a finding.
              </p>
            </section>

            <section>
              <h4 className="font-mono text-[10px] font-semibold uppercase tracking-widest text-slate-500">Expected output</h4>
              <p className="mt-2">
                A web-based research dashboard that generates plain-language paper summaries and cross-paper
                comparisons, complete with an interactive claim-verification view that maps every assertion to its
                exact source passage, highlights support status (supported, contradicted, or unresolved), and displays
                an evidence comparison matrix.
              </p>
            </section>

          </div>
        )}
      </div>

      <p className="max-w-sm text-center text-xs leading-relaxed text-slate-500">
        Ask a question about your papers — answers point to the exact lines they came from.
      </p>
    </div>
  );
}
