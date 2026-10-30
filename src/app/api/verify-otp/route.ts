/**
 * OTP Verification Endpoint (/api/verify-otp)
 * Specifications:
 *  - Accepts { email, code }
 *  - Invalidates/deletes OTP once consumed
 *  - Fails if expired or incorrect
 *  - On success, issues signed JWT with user identity and role
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { issueJwt, verifyAndConsumeOtp } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    let body: { email?: string; code?: string } = {};
    try {
      body = (await req.json()) as { email?: string; code?: string };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body provided." }, { status: 400 });
    }
    const email = (body.email || "").trim().toLowerCase();
    const code = (body.code || "").trim();

    if (!email || !code) {
      return NextResponse.json({ error: "Email and 6-digit verification code are required." }, { status: 400 });
    }

    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Verification code must be exactly 6 digits." }, { status: 400 });
    }

    // Check user exists
    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "No account found associated with this email." }, { status: 404 });
    }

    // Verify and consume OTP (deletes on success to prevent replay)
    const isValid = await verifyAndConsumeOtp(email, code);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid or expired verification code. Please request a new one." },
        { status: 401 }
      );
    }

    // On success: issue signed JWT with user identity and role
    const safeUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role || "user",
    };

    const token = issueJwt(safeUser);

    return NextResponse.json({
      success: true,
      token,
      user: safeUser,
      message: "Two-factor authentication successful.",
    });
  } catch (err) {
    console.error("verify-otp error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
