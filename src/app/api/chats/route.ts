/**
 * Chat history — list the signed-in user's conversations.
 * GET /api/chats?token=…
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userFromToken } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const user = await userFromToken(searchParams.get("token"));
    if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

    const chats = await db.chatSession.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { messages: true } } },
    });

    return NextResponse.json({
      chats: chats.map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt,
        messages: c._count.messages,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
