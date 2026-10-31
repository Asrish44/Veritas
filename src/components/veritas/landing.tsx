"use client";

import type { ReactNode } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import {
  ArrowRight,
  ChevronDown,
  Cpu,
  FileSearch,
  GitCompareArrows,
  ScanSearch,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EvidenceConstellation } from "./evidence-constellation";

interface Props {
  onSignIn: () => void;
  onGetStarted: () => void;
}

/* ---------------------------------- tilt ---------------------------------- */

function Tilt({ children, className, max = 7 }: { children: ReactNode; className?: string; max?: number }) {
  const reduceMotion = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [max, -max]), { stiffness: 180, damping: 22 });
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-max, max]), { stiffness: 180, damping: 22 });

  if (reduceMotion) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      style={{ rotateX, rotateY, transformPerspective: 1100, transformStyle: "preserve-3d" }}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return; // no stuck tilt on touch
        const r = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - r.left) / r.width - 0.5);
        my.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onPointerLeave={() => {
        mx.set(0);
        my.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------- animations ------------------------------- */

const rise = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const } },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.15 } },
};

/* ------------------------------ floating chips ----------------------------- */

const FLOATERS = [
  { label: "SUPPORTED", dot: "bg-emerald-400", pos: "left-[4%] top-[30%]", delay: 0 },
  { label: "CONTRADICTED", dot: "bg-red-400", pos: "right-[4%] top-[38%]", delay: 1.2 },
  { label: "UNRESOLVED", dot: "bg-amber-400", pos: "left-[7%] bottom-[20%]", delay: 0.6 },
];

function FloatingVerdicts() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden xl:block">
      {FLOATERS.map((f) => (
        <motion.div
          key={f.label}
          className={`absolute ${f.pos}`}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1, y: [0, -10, 0] }}
          transition={{
            opacity: { delay: 1 + f.delay * 0.2, duration: 0.8 },
            scale: { delay: 1 + f.delay * 0.2, duration: 0.8 },
            y: { delay: 1.8 + f.delay * 0.2, duration: 5 + f.delay, repeat: Infinity, ease: "easeInOut" },
          }}
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/60 px-3 py-1.5 font-mono text-[10px] tracking-widest text-slate-300 shadow-lg shadow-emerald-950/30 backdrop-blur">
            <span className={`h-1.5 w-1.5 rounded-full ${f.dot}`} />
            {f.label}
          </span>
        </motion.div>
      ))}
    </div>
  );
}

/* --------------------------------- content -------------------------------- */

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Every claim gets checked",
    body: "The assistant doesn't guess. Each statement in an answer is matched against your papers and given a green, red or yellow dot — so you always know what's confirmed and what isn't.",
  },
  {
    icon: GitCompareArrows,
    title: "It spots disagreements",
    body: "Two papers that don't agree? Veritas puts them side by side and explains why they differ — maybe they used different data, or measured different things.",
  },
  {
    icon: Cpu,
    title: "Your papers stay private",
    body: "Everything runs on your own machine. Nothing is uploaded, no outside services are called, and no data ever leaves your computer.",
  },
];

const STEPS = [
  { n: "01", title: "Add DOCX, PDF, TXT or MD", body: "Drag and drop any documents — DOCX, PDF, TXT, MD, CSV, or JSON. They're indexed locally for Veritas." },
  { n: "02", title: "Ask in plain words", body: "Type your question like you'd ask a friend. Veritas searches every page for the lines that matter." },
  { n: "03", title: "Answers get checked", body: "Each statement in the answer is matched to the exact lines in your papers that back it up." },
  { n: "04", title: "See the proof", body: "Tap a number like [1] to open the exact passage and page the answer came from." },
];

export function Landing({ onSignIn, onGetStarted }: Props) {
  return (
    <div className="dark relative flex min-h-screen flex-col overflow-x-clip bg-slate-950 text-slate-100">
      {/* ------------------------------- nav ------------------------------- */}
      <header className="fixed inset-x-0 top-0 z-30 border-b border-slate-800/60 bg-slate-950/60 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600/15 ring-1 ring-emerald-500/40">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Veritas</span>
          <nav className="ml-auto flex items-center gap-1.5">
            <a href="#features" className="hidden rounded-lg px-3 py-1.5 text-xs text-slate-400 transition-colors hover:text-slate-200 sm:block">
              Features
            </a>
            <a href="#how" className="hidden rounded-lg px-3 py-1.5 text-xs text-slate-400 transition-colors hover:text-slate-200 sm:block">
              How it works
            </a>
            <Button size="sm" variant="ghost" className="text-slate-300" onClick={onSignIn}>
              Sign in
            </Button>
            <Button size="sm" onClick={onGetStarted}>
              Get started <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </nav>
        </div>
      </header>

      <main className="relative z-10">
        {/* ------------------------------ hero ------------------------------ */}
        <section className="relative flex min-h-[100svh] flex-col overflow-hidden pb-5 pt-24">
          {/* 3D scene */}
          <EvidenceConstellation className="absolute inset-0" />

          {/* readability + blend overlays */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_45%,transparent_30%,rgba(2,6,23,0.55)_100%)]" />
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-slate-950" />
            <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-slate-950/80 to-transparent" />
          </div>

          <FloatingVerdicts />

          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="relative mx-auto my-auto w-full max-w-4xl px-4 text-center sm:px-6 lg:px-8"
          >
            <motion.div variants={rise}>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-3 py-1 text-[11px] text-emerald-300 shadow-[0_0_24px_-6px_rgba(16,185,129,0.5)]">
                <Sparkles className="h-3 w-3" /> A research helper that shows its proof
              </span>
            </motion.div>

            <motion.h1
              variants={rise}
              className="mx-auto mt-6 max-w-3xl text-[2.6rem] font-semibold leading-[1.06] tracking-tight sm:text-6xl lg:text-[4.2rem] xl:text-[4.4rem]"
            >
              Research answers with{" "}
              <span className="relative inline-block bg-gradient-to-r from-emerald-300 via-emerald-400 to-teal-300 bg-clip-text text-transparent">
                proof
                <svg aria-hidden className="absolute -bottom-2 left-0 w-full" viewBox="0 0 120 10" fill="none" preserveAspectRatio="none">
                  <motion.path
                    d="M2 7 Q 60 -2 118 6"
                    stroke="rgb(52 211 153 / 0.55)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ delay: 1.1, duration: 0.9, ease: "easeOut" }}
                  />
                </svg>
              </span>{" "}
              attached.
            </motion.h1>

            <motion.p variants={rise} className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-slate-400 sm:text-base">
              Add your papers, then just ask. Veritas finds the exact lines that answer your question, checks every
              statement, and shows you the page it came from — so you never have to take its word for it.
            </motion.p>

            <motion.div variants={rise} className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button
                size="lg"
                onClick={onGetStarted || onSignIn}
                className="group h-12 px-7 text-sm shadow-[0_0_36px_-8px_rgba(16,185,129,0.65)] transition-shadow hover:shadow-[0_0_48px_-6px_rgba(16,185,129,0.85)]"
              >
                Get Started
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </motion.div>

            <motion.div variants={rise} className="mt-7 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/70 px-2.5 py-1 ring-1 ring-slate-800 backdrop-blur">
                <Cpu className="h-3 w-3 text-emerald-500/80" /> Nothing leaves your computer
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/70 px-2.5 py-1 ring-1 ring-slate-800 backdrop-blur">
                <ScanSearch className="h-3 w-3 text-emerald-500/80" /> Checks its own answers
              </span>
              <span className="hidden items-center gap-1.5 rounded-full bg-slate-900/70 px-2.5 py-1 ring-1 ring-slate-800 backdrop-blur sm:inline-flex">
                <FileSearch className="h-3 w-3 text-emerald-500/80" /> Shows where every statement comes from
              </span>
            </motion.div>
          </motion.div>

          {/* scroll cue — in normal flow so it can never overlap content */}
          <motion.div
            className="relative mt-10 flex w-full shrink-0 justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2 }}
          >
            <a href="#features" aria-label="Scroll to features" className="text-slate-500 transition-colors hover:text-slate-300">
              <motion.div animate={{ y: [0, 6, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}>
                <ChevronDown className="h-5 w-5" />
              </motion.div>
            </a>
          </motion.div>
        </section>

        {/* ----------------------------- features ----------------------------- */}
        <section id="features" className="scroll-mt-24 px-4 pb-20 sm:px-6 lg:px-8 lg:pb-28">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-center text-[11px] font-semibold uppercase tracking-widest text-slate-500">Why Veritas</h2>
          </motion.div>
          <div className="mx-auto mt-8 grid max-w-5xl items-stretch gap-4 md:grid-cols-3 lg:max-w-6xl">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                className="h-full"
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.55, delay: i * 0.08 }}
              >
                <Tilt max={6} className="h-full">
                  <div className="group h-full rounded-2xl border border-slate-800 bg-slate-900/40 p-5 transition-colors hover:border-emerald-500/40 hover:bg-slate-900/60">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600/10 ring-1 ring-emerald-500/30 transition-shadow group-hover:shadow-[0_0_20px_-4px_rgba(16,185,129,0.6)]"
                      style={{ transform: "translateZ(28px)" }}
                    >
                      <f.icon className="h-5 w-5 text-emerald-400" />
                    </div>
                    <h3 className="mt-3.5 text-sm font-semibold">{f.title}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{f.body}</p>
                  </div>
                </Tilt>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ---------------------------- how it works ---------------------------- */}
        <section id="how" className="scroll-mt-24 px-4 pb-20 sm:px-6 lg:px-8 lg:pb-28">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="text-center text-[11px] font-semibold uppercase tracking-widest text-slate-500"
          >
            How it works
          </motion.h2>
          <div className="mx-auto mt-8 grid max-w-5xl gap-4 sm:grid-cols-2 lg:max-w-6xl lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.55, delay: i * 0.09 }}
                className="relative rounded-2xl border border-slate-800 bg-slate-900/40 p-5"
              >
                <p className="font-mono text-xs text-emerald-400">{s.n}</p>
                <h3 className="mt-2 flex items-center gap-1.5 text-sm font-semibold">
                  <FileSearch className="h-3.5 w-3.5 text-slate-500" />
                  {s.title}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{s.body}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ------------------------------- CTA band ------------------------------- */}
        <section className="px-4 pb-20 sm:px-6 lg:px-8 lg:pb-28">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6 }}
            className="relative mx-auto max-w-3xl overflow-hidden rounded-3xl border border-emerald-500/25 bg-gradient-to-b from-emerald-950/40 to-slate-900/60 px-6 py-12 text-center lg:max-w-4xl"
          >
            <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-40 w-[130%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/15 blur-[80px]" />
            <h2 className="relative text-2xl font-semibold tracking-tight sm:text-3xl">
              Stop trusting. Start <span className="bg-gradient-to-r from-emerald-300 to-emerald-500 bg-clip-text text-transparent">verifying</span>.
            </h2>
            <p className="relative mx-auto mt-2.5 max-w-md text-sm text-slate-400">
              Get started, drop DOCX, PDF, TXT or MD files, and ask Veritas anything — the proof is one tap away.
            </p>
            <div className="relative mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" className="h-11 px-6 shadow-[0_0_32px_-8px_rgba(16,185,129,0.7)]" onClick={onGetStarted || onSignIn}>
                Get Started <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="relative z-10 mt-auto border-t border-slate-800/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-[11px] text-slate-600 sm:px-6 lg:px-8">
          <span>Veritas — a research helper that shows its work</span>
          <span>Runs on your computer · nothing sent to the internet · every answer shows its sources</span>
        </div>
      </footer>
    </div>
  );
}
