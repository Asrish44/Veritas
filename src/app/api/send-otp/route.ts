/**
 * Resend OTP Endpoint (/api/send-otp)
 * Specifications:
 *  - Accepts { email }
 *  - Rate-limited to prevent abuse
 *  - Generates secure 6-digit numeric OTP with 10-minute expiry (TTL)
 *  - Dispatches via Nodemailer with server console fallback
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkOtpRateLimit, createAndSaveOtp, deliverOtp } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    let body: { email?: string } = {};
    try {
      body = (await req.json()) as { email?: string };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body provided." }, { status: 400 });
    }
    const email = (body.email || "").trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: "Email is required to dispatch verification code." }, { status: 400 });
    }

    // Check user exists
    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "No account found associated with this email." }, { status: 404 });
    }

    // Check rate limit
    const rateCheck = checkOtpRateLimit(email);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: `Please wait ${rateCheck.remainingSec}s before requesting another verification code.`,
          retryAfter: rateCheck.remainingSec,
        },
        { status: 429 }
      );
    }

    // Generate new OTP
    const code = await createAndSaveOtp(email);
    await deliverOtp(email, code);

    return NextResponse.json({
      success: true,
      message: "A fresh 6-digit verification code has been dispatched.",
    });
  } catch (err) {
    console.error("send-otp error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
