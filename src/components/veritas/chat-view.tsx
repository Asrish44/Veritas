"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  FileCheck,
  FileText,
  FileUp,
  History,
  Loader2,
  LogOut,
  MessageSquarePlus,
  MessageSquareText,
  Paperclip,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { AuthUser } from "./auth-card";
import { ProblemStatement } from "./problem-statement";

/* --------------------------------- types ---------------------------------- */

export interface Citation {
  n: number;
  ref: string;
  paperTitle: string;
  page: number;
  text: string;
  quote: string | null;
  verdict: string | null;
  claimText?: string | null;
}

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  error?: boolean;
}

interface ChatSummary {
  id: string;
  title: string;
  updatedAt: string;
  messages: number;
}

interface HealthLite {
  ready: boolean;
  store: { papers: number; passages: number; claims: number };
}

interface UploadedPaper {
  id: string;
  title: string;
  fileName: string;
  pages: number;
  status: string;
  createdAt: string;
  _count?: { passages: number; claims: number };
}

interface Props {
  user: AuthUser | null;
  onSignIn: () => void;
  onSignOut: () => void;
}

const VERDICT_DOT: Record<string, string> = {
  SUPPORTED: "bg-emerald-400",
  CONTRADICTED: "bg-rose-400",
  UNRESOLVED: "bg-amber-400",
};

const SUGGESTIONS = [
  "Summarize each paper in plain words",
  "What do the papers disagree on?",
  "What do the papers actually confirm?",
];

const TOKEN_KEY = "veritas_token";

const THINKING = ["looking through your papers…", "double-checking the sources…", "writing your answer…"];

let msgSeq = 0;
const nextId = () => `m${++msgSeq}-${Date.now()}`;

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Highlighted({ text, quote }: { text: string; quote: string | null }) {
  if (!quote || !text.includes(quote)) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest.length > 0) {
    const idx = rest.indexOf(quote);
    if (idx === -1) {
      parts.push(rest);
      break;
    }
    parts.push(rest.slice(0, idx));
    parts.push(
      <mark key={key++} className="rounded bg-emerald-400/20 px-0.5 text-emerald-200">
        {quote}
      </mark>
    );
    rest = rest.slice(idx + quote.length);
  }
  return <>{parts}</>;
}

/* -------------------------------- component -------------------------------- */

export function ChatView({ user, onSignIn, onSignOut }: Props) {
  const { toast } = useToast();

  const [health, setHealth] = useState<HealthLite | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [thinkStep, setThinkStep] = useState(0);
  const [openCite, setOpenCite] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [papers, setPapers] = useState<UploadedPaper[]>([]);
  const [showFilesDialog, setShowFilesDialog] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* ------------------------------ data loading ----------------------------- */

  const refreshHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      setHealth({ ready: data.ready, store: data.store });
    } catch {
      /* ignore */
    }
  }, []);

  const refreshChats = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setChats([]);
      return;
    }
    try {
      const res = await fetch(`/api/chats?token=${encodeURIComponent(token)}`);
      if (!res.ok) return;
      const data = await res.json();
      setChats(data.chats || []);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshPapers = useCallback(async () => {
    try {
      const res = await fetch("/api/papers");
      if (!res.ok) return;
      const data = await res.json();
      setPapers(data.papers || []);
    } catch {
      /* ignore */
    }
  }, []);

  const deletePaper = async (id: string, name: string) => {
    // Optimistic update: immediately remove from UI
    setPapers((prev) => prev.filter((p) => p.id !== id));
    try {
      let res = await fetch(`/api/papers/${id}`, { method: "DELETE" });
      if (!res.ok) {
        res = await fetch(`/api/papers?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      }
      if (res.ok) {
        toast({ title: "✓ Document removed", description: `Removed "${name}" from workspace` });
        void refreshHealth();
        void refreshPapers();
      } else {
        throw new Error(`Delete failed with status ${res.status}`);
      }
    } catch (err) {
      toast({
        title: "Failed to remove document",
        description: err instanceof Error ? err.message : "Error deleting file",
        variant: "destructive",
      });
      void refreshPapers();
    }
  };

  useEffect(() => {
    void refreshHealth();
    void refreshChats();
    void refreshPapers();
  }, [refreshHealth, refreshChats, refreshPapers]);

  useEffect(() => {
    if (!sending) return;
    const t = setInterval(() => setThinkStep((s) => (s + 1) % THINKING.length), 1600);
    return () => clearInterval(t);
  }, [sending]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    if (!openCite) return;
    document.getElementById(`cite-${openCite}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [openCite]);

  /* -------------------------------- actions -------------------------------- */

  const send = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question || sending) return;

      const previousHistory = messages
        .filter((m) => !m.error && m.content)
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

      setInput("");
      setSending(true);
      setMessages((prev) => [...prev, { id: nextId(), role: "user", content: question }]);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            history: previousHistory,
            token: localStorage.getItem(TOKEN_KEY) || undefined,
            sessionId: activeChat || undefined,
          }),
        });
        const data = await res.json();
        if (data.error) {
          setMessages((prev) => [...prev, { id: nextId(), role: "assistant", content: data.error, error: true }]);
        } else {
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: "assistant", content: data.answer, citations: data.citations || [] },
          ]);
          if (data.sessionId && data.sessionId !== activeChat) setActiveChat(data.sessionId);
          void refreshHealth();
          void refreshChats();
        }
      } catch (e) {
        const errorText =
          e instanceof Error && (e.message === "Failed to fetch" || e.message.includes("fetch"))
            ? "Request timed out or connection was interrupted. Please try again."
            : e instanceof Error
            ? e.message
            : String(e);
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: "assistant", content: errorText, error: true },
        ]);
      } finally {
        setSending(false);
      }
    },
    [sending, activeChat, refreshHealth, refreshChats, messages]
  );

  const newChat = () => {
    setMessages([]);
    setActiveChat(null);
    setOpenCite(null);
    setSidebarOpen(false);
  };

  const openChat = async (id: string) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    try {
      const res = await fetch(`/api/chats/${id}?token=${encodeURIComponent(token)}`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(
        (data.messages || []).map((m: { id: string; role: string; content: string; citations?: Citation[] }) => ({
          id: m.id,
          role: m.role === "user" ? "user" : "assistant",
          content: m.content,
          citations: m.citations || [],
        }))
      );
      setActiveChat(id);
      setOpenCite(null);
      setSidebarOpen(false);
    } catch {
      /* ignore */
    }
  };

  const deleteChat = async (id: string) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    await fetch(`/api/chats/${id}?token=${encodeURIComponent(token)}`, { method: "DELETE" });
    if (activeChat === id) newChat();
    void refreshChats();
    toast({ title: "Conversation deleted" });
  };

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("files", f));
      const token = (typeof window !== "undefined" && (sessionStorage.getItem("veritas_jwt") || localStorage.getItem("veritas_token"))) || "";
      const res = await fetch("/api/papers", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      const data = await res.json();
      if (data.error) {
        toast({ title: "Upload failed", description: data.error, variant: "destructive" });
      } else {
        const createdList = (data.created || []).filter((c: any) => !c.error);
        const errorList = (data.created || []).filter((c: any) => c.error);
        const skippedList = data.skipped || [];

        if (createdList.length > 0) {
          const names = createdList.map((c: any) => c.name).join(", ");
          toast({
            title: `✓ ${createdList.length} document${createdList.length === 1 ? "" : "s"} indexed`,
            description: `Successfully added: ${names}. Indexed for evidence-grounded answers with Veritas.`,
          });
        }
        if (skippedList.length > 0) {
          const names = skippedList.map((s: any) => s.name).join(", ");
          toast({ title: "Already in workspace", description: names });
        }
        if (errorList.length > 0) {
          const names = errorList.map((e: any) => e.name).join(", ");
          toast({ title: "Failed to parse", description: names, variant: "destructive" });
        }
        void refreshHealth();
        void refreshPapers();
      }
    } catch (err) {
      toast({
        title: "Upload error",
        description: err instanceof Error ? err.message : "Failed to upload files",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const loadSamples = async () => {
    setUploading(true);
    try {
      const res = await fetch("/api/samples", { method: "POST" });
      const data = await res.json();
      if (data.error) toast({ title: "Could not load samples", description: data.error, variant: "destructive" });
      else {
        toast({ title: `Loaded ${(data.created || []).length} sample papers` });
        void refreshHealth();
      }
    } finally {
      setUploading(false);
    }
  };

  /* ------------------------------ derived ---------------------------------- */

  const hasPapers = (health?.store.papers ?? 0) > 0;
  const hasReplied = messages.some((m) => m.role === "assistant");
  const engineOk = health?.ready === true;

  /* ------------------------- message body renderer -------------------------- */

  function renderAnswer(msg: ChatMsg) {
    const parts = msg.content.split(/(\[\d+\])/g);
    return parts.map((p, i) => {
      const m = p.match(/^\[(\d+)\]$/);
      if (m) {
        const n = Number(m[1]);
        const key = `${msg.id}:${n}`;
        const cite = msg.citations?.find((c) => c.n === n);
        return (
          <button
            key={i}
            onClick={() => setOpenCite(openCite === key ? null : key)}
            title={cite ? `${cite.paperTitle} · p.${cite.page}` : "source"}
            className={`mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded px-1 align-baseline text-[11px] font-semibold transition-colors ${
              cite ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40 hover:bg-emerald-500/25" : "bg-slate-700/40 text-slate-500"
            }`}
          >
            {n}
          </button>
        );
      }
      return <span key={i}>{p}</span>;
    });
  }

  /* -------------------------------- sidebar -------------------------------- */

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Button size="sm" className="w-full justify-start gap-2" onClick={newChat}>
          <MessageSquarePlus className="h-4 w-4" /> New chat
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-700 [&::-webkit-scrollbar]:w-1.5">
        {/* Workspace Sources */}
        <div className="mb-4">
          <div className="flex items-center justify-between px-2 pb-1.5 pt-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
              <FileText className="h-3 w-3 text-emerald-400" />
              Sources ({papers.length})
            </span>
            <button
              onClick={() => fileRef.current?.click()}
              title="Add document to workspace"
              className="rounded p-0.5 text-slate-500 hover:text-emerald-400 hover:bg-slate-800 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {papers.length === 0 ? (
            <div className="mx-1 rounded-xl border border-dashed border-slate-800/80 p-2.5 text-center bg-slate-900/30">
              <FileUp className="mx-auto h-4 w-4 text-slate-600" />
              <p className="mt-1 text-[11px] text-slate-400 font-medium">No files uploaded</p>
              <div className="mt-1.5 flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="text-[10px] text-emerald-400 hover:underline font-medium"
                >
                  + Upload PDF, DOCX, or PPTX
                </button>
                <button
                  type="button"
                  onClick={() => void loadSamples()}
                  disabled={uploading}
                  className="text-[10px] text-teal-400 hover:underline font-medium"
                >
                  ⚡ Load Sample Papers
                </button>
              </div>
            </div>
          ) : (
            <ul className="space-y-1">
              {papers.map((p) => {
                const ext = p.fileName.split(".").pop()?.toUpperCase() || "DOC";
                return (
                  <li
                    key={p.id}
                    className="group relative flex items-center justify-between rounded-lg px-2.5 py-1.5 bg-slate-900/70 border border-slate-800/70 hover:border-slate-700 hover:bg-slate-900 transition-colors"
                  >
                    <div className="min-w-0 flex-1 pr-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-emerald-500/15 text-emerald-300 px-1 py-0.5 text-[9px] font-mono font-bold leading-none">
                          .{ext}
                        </span>
                        <span className="truncate text-xs font-medium text-slate-200" title={p.fileName}>
                          {p.title}
                        </span>
                      </div>
                      <span className="mt-0.5 block text-[10px] text-slate-500">
                        {p.pages > 0 ? `${p.pages}p · ` : ""}{p._count?.passages ?? 0} passages
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void deletePaper(p.id, p.fileName)}
                      title="Remove document"
                      className="hidden h-5 w-5 items-center justify-center rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 group-hover:flex transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="px-2 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600 border-t border-slate-800/60">History</p>
        {!user ? (
          <div className="mx-1 rounded-xl border border-dashed border-slate-800 p-3 text-center">
            <History className="mx-auto h-4 w-4 text-slate-600" />
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">Sign in to save your chats.</p>
            <Button size="sm" variant="secondary" className="mt-2 h-7 w-full text-xs" onClick={onSignIn}>
              Sign in
            </Button>
          </div>
        ) : chats.length === 0 ? (
          <p className="px-2 text-[11px] leading-relaxed text-slate-600">No conversations yet — your chats will appear here.</p>
        ) : (
          <ul className="space-y-0.5">
            {chats.map((c) => (
              <li key={c.id} className="group relative">
                <button
                  onClick={() => void openChat(c.id)}
                  className={`w-full rounded-lg px-2.5 py-2 pr-8 text-left transition-colors ${
                    activeChat === c.id ? "bg-slate-800/80 text-slate-100" : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
                  }`}
                >
                  <span className="block truncate text-xs font-medium">{c.title}</span>
                  <span className="mt-0.5 block text-[10px] text-slate-600">
                    {timeAgo(c.updatedAt)} · {c.messages} msg{c.messages === 1 ? "" : "s"}
                  </span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void deleteChat(c.id);
                  }}
                  aria-label={`Delete ${c.title}`}
                  className="absolute right-1.5 top-2 hidden h-6 w-6 items-center justify-center rounded-md text-slate-600 hover:bg-slate-800 hover:text-rose-400 group-hover:flex"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-slate-800/70 p-3">
        {user ? (
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600/15 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/40">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-slate-200">{user.name}</p>
              <p className="truncate text-[10px] text-slate-500">{user.email}</p>
            </div>
            <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-slate-500 hover:text-rose-400" onClick={onSignOut} aria-label="Sign out">
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <p className="text-center text-[10px] text-slate-600">Guest mode — chats aren't saved</p>
        )}
      </div>
    </div>
  );

  /* -------------------------------- render --------------------------------- */

  return (
    <div
      className="dark flex min-h-screen bg-slate-950 text-slate-100"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void upload(e.dataTransfer.files);
      }}
    >
      {/* ambient background */}
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-[-260px] h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.07)_1px,transparent_0)] [background-size:28px_28px]" />
      </div>

      {/* desktop sidebar */}
      <aside className="relative z-10 hidden w-64 shrink-0 border-r border-slate-800/70 bg-slate-950/80 backdrop-blur lg:block">{sidebar}</aside>

      {/* mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 border-r border-slate-800 bg-slate-950">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* header */}
        <header className="sticky top-0 z-20 border-b border-slate-800/70 bg-slate-950/70 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open history">
              <History className="h-4 w-4" />
            </Button>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600/15 ring-1 ring-emerald-500/40">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Veritas</span>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFilesDialog(true)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                  papers.length > 0
                    ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/40"
                    : "border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-slate-300"
                }`}
                title="View and manage workspace sources"
              >
                <FileText className={`h-3.5 w-3.5 ${papers.length > 0 ? "text-emerald-400" : "text-slate-500"}`} />
                <span>
                  {papers.length > 0
                    ? `${papers.length} source${papers.length === 1 ? "" : "s"} active`
                    : "0 sources"}
                </span>
              </button>

              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.doc,.pptx,.ppt,.txt,.md,.markdown,.csv,.json,.html"
                multiple
                className="sr-only"
                onChange={(e) => void upload(e.target.files)}
                aria-label="Upload documents"
              />
            </div>
          </div>
        </header>

        <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-6 sm:px-6">
          {/* compact hero — only before the first reply, so a live conversation gets the full height */}
          {!hasReplied && (
            <section className="pb-5 pt-8 text-center sm:pt-10">
              <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
                Every answer shows its <span className="bg-gradient-to-r from-emerald-300 to-emerald-500 bg-clip-text text-transparent">proof</span>.
              </h1>
              <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-slate-500">
                {hasPapers
                  ? "Ask anything about your workspace documents — each statement links to verifiable proof."
                  : "Upload documents or ask anything directly — every answer is backed by verifiable sources."}
              </p>
            </section>
          )}

          {/* chat card */}
          <section
            aria-label="Chat with your papers"
            className={`flex flex-col overflow-hidden rounded-2xl border bg-slate-900/50 shadow-2xl shadow-emerald-950/20 backdrop-blur transition-colors ${
              hasReplied
                ? "h-[calc(100svh-114px)] min-h-[420px] shrink-0"
                : "min-h-[420px] flex-1"
            } ${dragOver ? "border-emerald-500" : "border-slate-800"}`}
          >
            {/* messages */}
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-700 [&::-webkit-scrollbar]:w-1.5">
              {messages.length === 0 ? (
                activeChat ? (
                  <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-center">
                    <MessageSquareText className="h-8 w-8 text-slate-700" />
                    <p className="text-sm text-slate-400">This conversation is empty.</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/30 text-emerald-400">
                      <Sparkles className="h-6 w-6" />
                    </div>
                    <h2 className="text-base font-semibold text-slate-200">
                      Welcome to Veritas Research Assistant
                    </h2>
                    <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-slate-400">
                      Ask any question across your workspace documents with verifiable evidence citations, or explore general science, computing, and web information.
                    </p>

                    {/* Quick Suggestion Chips */}
                    <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-xl">
                      {[
                        "👋 Hello Veritas, introduce yourself",
                        "📑 Sample research paper layout for every sector",
                        "📄 What research topics are in this workspace?",
                        "🔍 How does evidence verification work?",
                        "⚛️ What is quantum computing superposition?",
                      ].map((promptText) => (
                        <button
                          key={promptText}
                          type="button"
                          onClick={() => {
                            setInput(promptText.replace(/^[^\s]+\s/, ""));
                          }}
                          className="rounded-full border border-slate-800 bg-slate-950/70 px-3.5 py-1.5 text-xs text-slate-300 hover:border-emerald-500/40 hover:bg-slate-900 transition-colors"
                        >
                          {promptText}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              ) : (
                messages.map((m) =>
                  m.role === "user" ? (
                    <div key={m.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-slate-800 px-4 py-2.5 text-sm leading-relaxed text-slate-100">{m.content}</div>
                    </div>
                  ) : (
                    <div key={m.id} className="flex justify-start">
                      <div
                        className={`max-w-[95%] rounded-2xl rounded-bl-md border px-4 py-3 text-sm leading-relaxed ${
                          m.error ? "border-rose-800/60 bg-rose-950/30 text-rose-200" : "border-slate-800 bg-slate-950/60 text-slate-200"
                        }`}
                      >
                        <div className="whitespace-pre-wrap leading-relaxed">{renderAnswer(m)}</div>

                        {m.citations && m.citations.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {m.citations.map((c) => (
                              <button
                                key={c.n}
                                onClick={() => setOpenCite(openCite === `${m.id}:${c.n}` ? null : `${m.id}:${c.n}`)}
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                                  openCite === `${m.id}:${c.n}`
                                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
                                    : "border-slate-700 bg-slate-900/70 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                                }`}
                              >
                                {c.verdict && <span className={`h-1.5 w-1.5 rounded-full ${VERDICT_DOT[c.verdict] || "bg-slate-400"}`} />}
                                <span className="font-mono">[{c.n}]</span>
                                <span className="max-w-[180px] truncate">{c.paperTitle}</span>
                                <span className="text-slate-500">p.{c.page}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {m.citations?.map((c) =>
                          openCite === `${m.id}:${c.n}` ? (
                            <div key={`ev-${c.n}`} id={`cite-${m.id}:${c.n}`} className="mt-2.5 rounded-xl border border-slate-800 bg-slate-950/80 p-3">
                              <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px]">
                                {c.verdict && (
                                  <span
                                    className={`rounded px-1.5 py-0.5 font-semibold ${
                                      c.verdict === "SUPPORTED"
                                        ? "bg-emerald-600/90 text-white"
                                        : c.verdict === "CONTRADICTED"
                                          ? "bg-rose-600/90 text-white"
                                          : "bg-amber-600/90 text-white"
                                    }`}
                                  >
                                    {c.verdict}
                                  </span>
                                )}
                                <span className="font-mono text-slate-500">{c.ref} · page {c.page}</span>
                                <span className="truncate text-slate-500">{c.paperTitle}</span>
                              </div>
                              {c.claimText && <p className="mb-1.5 text-xs italic text-slate-400">Claim: “{c.claimText}”</p>}
                              <p className="max-h-44 overflow-y-auto text-xs leading-relaxed text-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-700 [&::-webkit-scrollbar]:w-1.5">
                                <Highlighted text={c.text} quote={c.quote} />
                              </p>
                            </div>
                          ) : null
                        )}
                      </div>
                    </div>
                  )
                )
              )}

              {sending && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2.5 rounded-2xl rounded-bl-md border border-slate-800 bg-slate-950/60 px-4 py-3">
                    <span className="flex gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:300ms]" />
                    </span>
                    <span className="text-xs text-slate-500">{THINKING[thinkStep]}</span>
                  </div>
                </div>
              )}
            </div>

            {/* suggestions */}
            {hasPapers && !hasReplied && !sending && (
              <div className="flex flex-wrap gap-2 border-t border-slate-800/70 px-4 pt-3 sm:px-5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-400 transition-colors hover:border-emerald-500/50 hover:text-emerald-300"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}


            {/* input */}
            <form
              className="flex items-center gap-2 p-3 sm:p-4"
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
            >
              <div className="relative flex-1">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  title="Upload documents"
                  className="absolute left-2.5 top-2 rounded p-0.5 text-slate-500 hover:text-emerald-400 transition-colors"
                  aria-label="Upload documents"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask anything about your workspace documents or general knowledge…"
                  disabled={sending}
                  className="h-9 w-full rounded-xl border border-slate-800 bg-slate-950/70 pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:opacity-50"
                  aria-label="Question"
                />
              </div>
              <Button size="icon" className="h-9 w-9 rounded-xl" type="submit" disabled={sending || !input.trim()} aria-label="Send">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </Button>
            </form>
          </section>

          <p className="mt-4 text-center text-[11px] text-slate-600">
            Your papers stay on this computer · every answer shows its sources
          </p>
        </main>
      </div>

      {/* Workspace Documents Modal */}
      {showFilesDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">Workspace Documents</h3>
                  <p className="text-[11px] text-slate-400">Sources indexed for evidence-grounded answers with Veritas</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFilesDialog(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="my-4 max-h-72 overflow-y-auto space-y-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-700 [&::-webkit-scrollbar]:w-1.5 pr-1">
              {papers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center bg-slate-900/30">
                  <FileUp className="mx-auto h-8 w-8 text-slate-600 mb-2" />
                  <p className="text-xs font-medium text-slate-300">No documents in workspace yet</p>
                  <p className="text-[11px] text-slate-500 mt-1">Upload PDF, DOCX, TXT, MD, or CSV files to ground your queries.</p>
                </div>
              ) : (
                papers.map((p) => {
                  const ext = p.fileName.split(".").pop()?.toUpperCase() || "DOC";
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-900/60 p-3 hover:border-slate-700 transition-colors"
                    >
                      <div className="min-w-0 flex-1 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-emerald-500/15 text-emerald-300 px-1.5 py-0.5 text-[10px] font-mono font-bold">
                            .{ext}
                          </span>
                          <span className="truncate text-xs font-semibold text-slate-200">{p.title}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                          <span>{p.fileName}</span>
                          <span>·</span>
                          <span>{p.pages > 0 ? `${p.pages} pages · ` : ""}${p._count?.passages ?? 0} passages indexed</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void deletePaper(p.id, p.fileName)}
                        title="Remove document from workspace"
                        className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                onClick={() => {
                  setShowFilesDialog(false);
                  fileRef.current?.click();
                }}
              >
                <FileUp className="h-3.5 w-3.5" />
                Upload New File
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs text-slate-400 hover:text-slate-200"
                onClick={() => setShowFilesDialog(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
