/**
 * Admin API Endpoint
 * Protected by secret admin link token (ADMIN_SECRET_KEY) or admin JWT role
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ADMIN_SECRET_KEY, userFromToken } from "@/lib/auth";
import { getLlmConfig, pingOllama } from "@/lib/llm";

export const runtime = "nodejs";

async function isAuthorized(req: Request, urlToken?: string | null): Promise<boolean> {
  // 1. Authorized if secret link token matches
  if (urlToken && urlToken === ADMIN_SECRET_KEY) {
    return true;
  }

  // 2. Authorized if Authorization header has token of an admin user
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    const user = await userFromToken(authHeader);
    if (user && user.role === "admin") {
      return true;
    }
  }

  return false;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!(await isAuthorized(req, token))) {
      return NextResponse.json({ error: "Access Denied: Administrative link token required." }, { status: 403 });
    }

    // Fetch system overview
    const [users, papers, passageCount, claimCount, chatSessionCount] = await Promise.all([
      db.user.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          _count: { select: { chats: true } },
        },
      }),
      db.paper.findMany({
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { passages: true, claims: true } } },
      }),
      db.passage.count(),
      db.claim.count(),
      db.chatSession.count(),
    ]);

    // Check Ollama status
    const ollamaStatus = await pingOllama(true);
    const llmConfig = getLlmConfig();

    return NextResponse.json({
      authorized: true,
      adminToken: ADMIN_SECRET_KEY,
      llm: {
        provider: "ollama",
        model: llmConfig.model,
        baseUrl: llmConfig.baseUrl,
        reachable: ollamaStatus.reachable,
        installedModels: ollamaStatus.models,
        qwen3Installed: ollamaStatus.models.some((m) => m.toLowerCase().includes("qwen3:14b") || m.toLowerCase().includes("qwen3")),
      },
      stats: {
        totalUsers: users.length,
        totalPapers: papers.length,
        totalPassages: passageCount,
        totalClaims: claimCount,
        totalChats: chatSessionCount,
      },
      users,
      papers: papers.map((p) => ({
        id: p.id,
        title: p.title,
        fileName: p.fileName,
        hash: p.hash,
        pages: p.pages,
        passages: p._count.passages,
        status: p.status,
        createdAt: p.createdAt,
      })),
    });
  } catch (err) {
    console.error("Admin GET error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!(await isAuthorized(req, token))) {
      return NextResponse.json({ error: "Access Denied: Administrative link token required." }, { status: 403 });
    }

    const body = (await req.json()) as {
      action?: string;
      userId?: string;
      paperId?: string;
      role?: string;
      testPrompt?: string;
    };

    // 1. Toggle or set user role
    if (body.action === "updateRole" && body.userId && body.role) {
      const updated = await db.user.update({
        where: { id: body.userId },
        data: { role: body.role },
      });
      return NextResponse.json({ success: true, user: updated });
    }

    // 2. Delete user
    if (body.action === "deleteUser" && body.userId) {
      await db.user.delete({ where: { id: body.userId } });
      return NextResponse.json({ success: true });
    }

    // 3. Delete paper
    if (body.action === "deletePaper" && body.paperId) {
      await db.paper.delete({ where: { id: body.paperId } });
      return NextResponse.json({ success: true });
    }

    // 4. Test Qwen3-14B inference live
    if (body.action === "testModel") {
      const prompt = body.testPrompt || "Explain how Two-Factor Authentication protects against credential stuffing in 2 sentences.";
      const cfg = getLlmConfig();
      const startTime = Date.now();

      const res = await fetch(`${cfg.baseUrl}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
          "User-Agent": "Veritas-Client/1.0",
        },
        body: JSON.stringify({
          model: cfg.model,
          prompt: `${prompt} Answer briefly. /no_think`,
          stream: false,
          options: {
            num_predict: 100,
            temperature: 0.3,
          },
        }),
        signal: AbortSignal.timeout(180_000),
      });

      if (!res.ok) {
        throw new Error(`Ollama returned status ${res.status}`);
      }

      const data = (await res.json()) as { response?: string };
      const durationMs = Date.now() - startTime;

      // Clean think tags if any
      const cleaned = (data.response || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

      return NextResponse.json({
        success: true,
        model: cfg.model,
        durationMs,
        response: cleaned || data.response || "Inference completed",
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Admin POST error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
