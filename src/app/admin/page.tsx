"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Check,
  Copy,
  Cpu,
  Database,
  FilePlus,
  FileText,
  FileUp,
  KeyRound,
  Link as LinkIcon,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Send,
  Shield,
  ShieldAlert,
  Trash2,
  UploadCloud,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface AdminData {
  authorized: boolean;
  adminToken: string;
  llm: {
    provider: string;
    model: string;
    baseUrl: string;
    reachable: boolean;
    installedModels: string[];
    qwen3Installed: boolean;
  };
  stats: {
    totalUsers: number;
    totalPapers: number;
    totalPassages: number;
    totalClaims: number;
    totalChats: number;
  };
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: string;
    _count: { chats: number };
  }>;
  papers: Array<{
    id: string;
    title: string;
    fileName: string;
    hash: string;
    pages: number;
    passages: number;
    status: string;
    createdAt: string;
  }>;
}

function AdminContent() {
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token") || "";

  const [token, setToken] = useState<string>(tokenFromUrl);
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Model test state
  const [testPrompt, setTestPrompt] = useState("Explain how Two-Factor Authentication protects user data in 2 concise sentences.");
  const [testingModel, setTestingModel] = useState(false);
  const [testResult, setTestResult] = useState<{ durationMs: number; response: string } | null>(null);

  // Document Ingestion state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [uploadProgressMsg, setUploadProgressMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingDocs(true);
    setUploadProgressMsg(`Uploading & indexing ${files.length} document(s)...`);

    try {
      const fd = new FormData();
      for (let i = 0; i < files.length; i++) {
        fd.append("files", files[i]);
      }
      const authToken = (typeof window !== "undefined" && (sessionStorage.getItem("veritas_jwt") || localStorage.getItem("veritas_token"))) || "";
      const res = await fetch("/api/papers", {
        method: "POST",
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to upload documents");
      }
      setUploadProgressMsg(`Successfully ingested ${json.count || files.length} document(s) into RAG knowledge base!`);
      setTimeout(() => setUploadProgressMsg(null), 5000);
      await loadAdminData(token);
    } catch (err) {
      setUploadProgressMsg(err instanceof Error ? `Upload error: ${err.message}` : "Failed to upload");
    } finally {
      setUploadingDocs(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Fetch admin data
  const loadAdminData = async (activeToken: string) => {
    if (!activeToken) {
      setLoading(false);
      setError("This admin page can only be opened via an authorized secret link.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin?token=${encodeURIComponent(activeToken)}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Access Denied: Invalid admin link token.");
        setData(null);
      } else {
        setData(json);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tokenFromUrl) {
      setToken(tokenFromUrl);
      void loadAdminData(tokenFromUrl);
    } else {
      setLoading(false);
    }
  }, [tokenFromUrl]);

  const handleManualUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (token) {
      void loadAdminData(token);
    }
  };

  const copyAdminLink = () => {
    const activeToken = data?.adminToken || token;
    const url = `${window.location.origin}/admin?token=${encodeURIComponent(activeToken)}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    if (!data) return;
    try {
      const res = await fetch(`/api/admin?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateRole", userId, role: newRole }),
      });
      if (res.ok) {
        setData({
          ...data,
          users: data.users.map((u) => (u.id === userId ? { ...u, role: newRole } : u)),
        });
      }
    } catch (err) {
      alert("Failed to update role");
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      const res = await fetch(`/api/admin?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteUser", userId }),
      });
      if (res.ok) {
        setData({
          ...data!,
          users: data!.users.filter((u) => u.id !== userId),
          stats: { ...data!.stats, totalUsers: data!.stats.totalUsers - 1 },
        });
      }
    } catch {
      alert("Failed to delete user");
    }
  };

  const handleDeletePaper = async (paperId: string) => {
    if (!confirm("Are you sure you want to delete this document?")) return;
    try {
      const res = await fetch(`/api/admin?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deletePaper", paperId }),
      });
      if (res.ok) {
        setData({
          ...data!,
          papers: data!.papers.filter((p) => p.id !== paperId),
          stats: { ...data!.stats, totalPapers: data!.stats.totalPapers - 1 },
        });
      }
    } catch {
      alert("Failed to delete document");
    }
  };

  const handleRunModelTest = async () => {
    setTestingModel(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/admin?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "testModel", testPrompt }),
      });
      const json = await res.json();
      if (res.ok) {
        setTestResult({
          durationMs: json.durationMs,
          response: json.response,
        });
      } else {
        alert(json.error || "Model test failed");
      }
    } catch (e) {
      alert("Inference test failed: " + String(e));
    } finally {
      setTestingModel(false);
    }
  };

  // If not unlocked / no valid link
  if (!data) {
    return (
      <div className="dark min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-900/40 bg-slate-900/60 p-6 shadow-2xl backdrop-blur">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 mb-4">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-center tracking-tight text-slate-100">
            Administrative Access Restricted
          </h1>
          <p className="mt-2 text-xs text-center text-slate-400 leading-relaxed">
            This administration console is private and can{" "}
            <span className="font-semibold text-rose-400">only be opened via authorized link</span> containing a valid security token.
          </p>

          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-rose-800/60 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleManualUnlock} className="mt-5 space-y-3">
            <div>
              <label htmlFor="token-input" className="block text-[11px] font-medium text-slate-400 mb-1">
                Have the Admin Link Token?
              </label>
              <input
                id="token-input"
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste token or link here..."
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
            </div>
            <Button type="submit" disabled={loading || !token.trim()} className="w-full bg-rose-600 hover:bg-rose-500 text-white">
              {loading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <KeyRound className="mr-2 h-3.5 w-3.5" />}
              Unlock Console
            </Button>
          </form>

          <div className="mt-5 pt-4 border-t border-slate-800 text-center">
            <a href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300">
              <ArrowLeft className="h-3 w-3" /> Return to Main Application
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dark min-h-screen bg-slate-950 text-slate-100 pb-16">
      {/* Top Header */}
      <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-400">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm tracking-tight">Veritas Admin Console</span>
                <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                  Link Authenticated
                </span>
              </div>
              <p className="text-[11px] text-slate-500">Private Admin URL Access</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={copyAdminLink} className="gap-1.5 text-xs border-slate-700 bg-slate-900">
              {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedLink ? "Link Copied!" : "Copy Admin Link"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => (window.location.href = "/")} className="gap-1 text-xs text-slate-400">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to App
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
        {/* Admin Link Banner */}
        <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
              <LinkIcon className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-xs font-semibold text-emerald-300">Admin Secret Direct Access Link</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Bookmark or share this direct URL. Opening this page without this secret key results in 403 access denial:
              </p>
              <code className="inline-block mt-1.5 text-[10px] bg-slate-950 px-2 py-1 rounded border border-slate-800 text-emerald-400 font-mono break-all">
                {typeof window !== "undefined" ? `${window.location.origin}/admin?token=${data.adminToken}` : `/admin?token=${data.adminToken}`}
              </code>
            </div>
          </div>
          <Button size="sm" onClick={copyAdminLink} className="bg-emerald-600 hover:bg-emerald-500 text-white shrink-0">
            {copiedLink ? "Copied" : "Copy Secret Link"}
          </Button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-medium">Registered Users</span>
              <Users className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-bold">{data.stats.totalUsers}</div>
            <span className="text-[10px] text-slate-500">2FA Verified</span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-medium">Documents</span>
              <FileText className="h-4 w-4 text-cyan-400" />
            </div>
            <div className="mt-2 text-2xl font-bold">{data.stats.totalPapers}</div>
            <span className="text-[10px] text-slate-500">DOCX, PDF, TXT, MD</span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-medium">Indexed Passages</span>
              <Database className="h-4 w-4 text-indigo-400" />
            </div>
            <div className="mt-2 text-2xl font-bold">{data.stats.totalPassages}</div>
            <span className="text-[10px] text-slate-500">Vectorized</span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-medium">Extracted Claims</span>
              <Shield className="h-4 w-4 text-amber-400" />
            </div>
            <div className="mt-2 text-2xl font-bold">{data.stats.totalClaims}</div>
            <span className="text-[10px] text-slate-500">Cross-verified</span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-medium">Active Model</span>
              <Cpu className="h-4 w-4 text-rose-400" />
            </div>
            <div className="mt-2 text-sm font-bold text-slate-200">Qwen3-14B</div>
            <span className="text-[10px] text-emerald-400">Ollama Local</span>
          </div>
        </div>

        {/* Qwen3-14B Model Live Status & Test Console */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 backdrop-blur">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  Qwen3-14B Local Model Engine
                  {data.llm.reachable ? (
                    <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] text-emerald-400 font-normal">
                      ● Ollama Online
                    </span>
                  ) : (
                    <span className="rounded-full bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 text-[10px] text-rose-400 font-normal">
                      ● Offline
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Connected to {data.llm.baseUrl} • Model target: <strong className="text-slate-200">{data.llm.model}</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => loadAdminData(token)} className="gap-1.5 text-xs border-slate-700 bg-slate-950">
                <RefreshCw className="h-3.5 w-3.5" /> Refresh Status
              </Button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-500">Service Status</span>
                <span className={data.llm.reachable ? "text-emerald-400 font-medium" : "text-rose-400 font-medium"}>
                  {data.llm.reachable ? "Connected & Ready" : "Unreachable"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-500">Model Name</span>
                <span className="text-slate-200 font-mono">qwen3:14b</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-500">Weights Size</span>
                <span className="text-slate-200">9.3 GB</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-500">Inference Mode</span>
                <span className="text-slate-200">Local (Zero external APIs)</span>
              </div>
              <div className="pt-2">
                <span className="text-slate-500 block mb-1">Installed Models:</span>
                <div className="flex flex-wrap gap-1">
                  {data.llm.installedModels.map((m) => (
                    <span key={m} className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 font-mono text-[10px] text-cyan-400">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Live Model Testing Box */}
            <div className="md:col-span-2 rounded-xl bg-slate-950 border border-slate-800 p-3 flex flex-col justify-between">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
                  Live Qwen3-14B Test Prompt
                </label>
                <div className="flex gap-2">
                  <input
                    value={testPrompt}
                    onChange={(e) => setTestPrompt(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    placeholder="Enter test prompt for Qwen3-14B..."
                  />
                  <Button size="sm" onClick={handleRunModelTest} disabled={testingModel} className="bg-purple-600 hover:bg-purple-500 text-white shrink-0">
                    {testingModel ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                    Run Inference
                  </Button>
                </div>
              </div>

              {testResult && (
                <div className="mt-3 rounded-lg border border-purple-900/50 bg-purple-950/20 p-3 text-xs">
                  <div className="flex items-center justify-between text-[10px] text-purple-300 font-semibold mb-1">
                    <span>Qwen3-14B Output</span>
                    <span>Latency: {testResult.durationMs}ms</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed font-sans">{testResult.response}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* User Management Section */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 backdrop-blur">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Users className="h-4 w-4 text-emerald-400" />
                Registered User Accounts & 2FA Status
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Passwords hashed with bcrypt (cost factor 10). Two-Factor Authentication enforced on login.
              </p>
            </div>
            <span className="text-xs text-slate-500">{data.users.length} registered</span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">User</th>
                  <th className="py-2.5 px-3">Email</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Registered</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/20">
                {data.users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 font-medium text-slate-200">{u.name}</td>
                    <td className="py-2.5 px-3 text-slate-300 font-mono text-[11px]">{u.email}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                          u.role === "admin"
                            ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                            : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                        }`}
                      >
                        {u.role.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[10px] text-slate-400 hover:text-slate-100"
                        onClick={() => handleUpdateRole(u.id, u.role === "admin" ? "user" : "admin")}
                      >
                        Set as {u.role === "admin" ? "User" : "Admin"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[10px] text-rose-400 hover:text-rose-300"
                        onClick={() => handleDeleteUser(u.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Uploaded Documents Repository */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 backdrop-blur">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <FileText className="h-4 w-4 text-cyan-400" />
                RAG Knowledge Base & Ingested Documents
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Upload and manage documents (DOCX, PDF, TXT, MD, CSV, JSON). Chunked and indexed with BGE-Small embeddings for Qwen3-14B retrieval.
              </p>
            </div>
            <span className="text-xs text-slate-500">{data.papers.length} documents indexed</span>
          </div>

          {/* RAG Document Ingestion Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void handleUploadFiles(e.dataTransfer.files);
            }}
            className={`mb-5 rounded-xl border-2 border-dashed p-6 text-center transition-all ${
              dragOver
                ? "border-cyan-400 bg-cyan-950/30"
                : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt,.md,.markdown,.csv,.json,.html"
              multiple
              className="sr-only"
              onChange={(e) => void handleUploadFiles(e.target.files)}
            />
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                {uploadingDocs ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadCloud className="h-5 w-5" />}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-200">
                  Upload Documents to RAG Knowledge Base
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Drag & drop or select <strong className="text-slate-300">DOCX, PDF, TXT, MD, CSV, or JSON</strong> files. Automatically chunked & embedded for Qwen3-14B.
                </p>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <Button
                  size="sm"
                  disabled={uploadingDocs}
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs gap-1.5 h-8 shadow-sm"
                >
                  {uploadingDocs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
                  {uploadingDocs ? "Indexing Passages..." : "Choose Files to Ingest"}
                </Button>
              </div>
              {uploadProgressMsg && (
                <p className="mt-2 text-xs font-medium text-cyan-400 animate-pulse">
                  {uploadProgressMsg}
                </p>
              )}
            </div>
          </div>

          {data.papers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-slate-500 text-xs">
              No documents uploaded yet. Go to the main app to upload DOCX, PDF, TXT, MD or any format.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Title / Name</th>
                    <th className="py-2.5 px-3">Format</th>
                    <th className="py-2.5 px-3">Pages / Chunks</th>
                    <th className="py-2.5 px-3">Passages</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Uploaded</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900/20">
                  {data.papers.map((p) => {
                    const ext = p.fileName.split(".").pop()?.toUpperCase() || "DOC";
                    return (
                      <tr key={p.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-slate-200">{p.title}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{p.fileName}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 font-mono text-[10px] text-cyan-300">
                            .{ext}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-300">{p.pages}</td>
                        <td className="py-2.5 px-3 text-slate-300">{p.passages} passages</td>
                        <td className="py-2.5 px-3">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            {p.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                          {new Date(p.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[10px] text-rose-400 hover:text-rose-300"
                            onClick={() => handleDeletePaper(p.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="dark flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
        </div>
      }
    >
      <AdminContent />
    </Suspense>
  );
}

