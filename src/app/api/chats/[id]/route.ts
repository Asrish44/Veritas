/**
 * One conversation — load its messages, or delete it.
 * GET    /api/chats/{id}?token=…
 * DELETE /api/chats/{id}?token=…
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userFromToken } from "@/lib/auth";

export const runtime = "nodejs";

async function ownedChat(id: string, token: string | null) {
  const user = await userFromToken(token);
  if (!user) return { error: "not signed in", status: 401 as const };
  const chat = await db.chatSession.findUnique({ where: { id } });
  if (!chat || chat.userId !== user.id) return { error: "chat not found", status: 404 as const };
  return { chat };
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { searchParams } = new URL(req.url);
    const owned = await ownedChat(id, searchParams.get("token"));
    if ("error" in owned) return NextResponse.json({ error: owned.error }, { status: owned.status });

    const messages = await db.chatMessage.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      title: owned.chat.title,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        citations: m.citations ? JSON.parse(m.citations) : [],
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { searchParams } = new URL(req.url);
    const owned = await ownedChat(id, searchParams.get("token"));
    if ("error" in owned) return NextResponse.json({ error: owned.error }, { status: owned.status });

    await db.chatMessage.deleteMany({ where: { sessionId: id } });
    await db.chatSession.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
