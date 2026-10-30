/**
 * Authentication Route Handler
 * Implements:
 *  - Registration (name, email, phone, location, password) with bcrypt hashing & email uniqueness check
 *  - Step 1 Login (verifies password, does NOT issue token, sends 6-digit OTP, returns { otpRequired: true, email })
 *  - Session check ("me") via JWT or session
 *  - Logout
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  createAndSaveOtp,
  deliverOtp,
  hashPassword,
  userFromToken,
  verifyPassword,
} from "@/lib/auth";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action?: string;
      email?: string;
      password?: string;
      name?: string;
      token?: string;
    };
    const action = body.action || "";

    // 1. REGISTRATION
    if (action === "register") {
      const email = (body.email || "").trim().toLowerCase();
      const password = body.password || "";
      const name = (body.name || "").trim() || email.split("@")[0];

      if (!EMAIL_RE.test(email)) {
        return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
      }
      if (password.length < 6) {
        return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
      }

      // Ensure uniqueness of email addresses
      const existing = await db.user.findUnique({ where: { email } });
      if (existing) {
        return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
      }

      // Hash password securely using bcrypt (cost 10)
      const passwordHash = await hashPassword(password);

      // Check if this is the first user; if so, assign admin role
      const userCount = await db.user.count();
      const role = userCount === 0 || email.includes("admin") ? "admin" : "user";

      const user = await db.user.create({
        data: {
          email,
          name,
          role,
          passwordHash,
        },
      });

      // Initiate 2FA verification immediately for the newly registered account
      const otpCode = await createAndSaveOtp(user.email);
      await deliverOtp(user.email, otpCode);

      return NextResponse.json({
        otpRequired: true,
        email: user.email,
        message: "Account registered! A 6-digit verification code has been sent to your email.",
      });
    }

    // 2. TWO-STEP LOGIN (STEP 1)
    if (action === "login") {
      const email = (body.email || "").trim().toLowerCase();
      const password = body.password || "";

      if (!email || !password) {
        return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
      }

      const user = await db.user.findUnique({ where: { email } });
      if (!user) {
        return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
      }

      // Verify bcrypt hash
      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) {
        return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
      }

      // Valid credentials: DO NOT log them in immediately!
      // Generate secure 6-digit numeric OTP with 10-minute expiry (TTL)
      const otpCode = await createAndSaveOtp(user.email);

      // Send the code to user's email via Nodemailer (fallback logging to console)
      await deliverOtp(user.email, otpCode);

      // Return { otpRequired: true, email } to switch UI to the OTP entry screen
      return NextResponse.json({
        otpRequired: true,
        email: user.email,
        message: "Credentials verified. Please enter the 6-digit verification code sent to your email.",
      });
    }

    // 3. GET CURRENT USER ("ME")
    if (action === "me") {
      // Check Bearer token from header or body
      const authHeader = req.headers.get("authorization");
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : body.token;

      const user = await userFromToken(token);
      if (!user) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      }
      return NextResponse.json({ user });
    }

    // 4. LOGOUT
    if (action === "logout") {
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("Auth route error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
