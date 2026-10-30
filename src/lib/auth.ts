/**
 * Authentication & 2FA Engine
 * Features:
 *  - Password hashing via bcrypt (cost factor 10-12)
 *  - Two-step login with secure 6-digit numeric OTP (10 min TTL)
 *  - Nodemailer email delivery with server console fallback for local dev
 *  - OTP consumption / invalidation
 *  - Signed JWT tokens with user identity & role
 *  - Rate-limited OTP resend
 */

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { randomInt, scryptSync, timingSafeEqual } from "crypto";
import { db } from "./db";

const BCRYPT_ROUNDS = 10;
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const JWT_SECRET = process.env.JWT_SECRET || "veritas-secure-jwt-token-hackathon-2026-cbit-key";
export const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || "admin-secret-access-link-cbit-2026";

export interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface JwtPayload {
  id: string;
  email: string;
  name: string;
  role: string;
}

/** Hash password using bcrypt with cost factor 10-12 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/** Verify password against stored bcrypt hash (with backward compat for legacy scrypt) */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith("$2a$") || stored.startsWith("$2b$") || stored.startsWith("$2y$")) {
    return bcrypt.compare(password, stored);
  }
  // Fallback for legacy scrypt hashes:
  const [salt, hash] = stored.split(":");
  if (salt && hash) {
    try {
      const candidate = scryptSync(password, salt, 64);
      const expected = Buffer.from(hash, "hex");
      return candidate.length === expected.length && timingSafeEqual(candidate, expected);
    } catch {
      return false;
    }
  }
  return false;
}

/** Issue a signed JWT token containing user identity and role */
export function issueJwt(user: SafeUser): string {
  const payload: JwtPayload = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role || "user",
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

/** Verify and decode JWT token */
export function verifyJwt(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/** Generate a secure 6-digit numeric OTP */
export function generateOtp(): string {
  return randomInt(100000, 999999).toString();
}

/** Generate and save an OTP to database with 10-minute expiry */
export async function createAndSaveOtp(email: string): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase();
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  // Invalidate any previous OTPs for this email
  await db.otpCode.deleteMany({ where: { email: normalizedEmail } }).catch(() => undefined);

  // Save the new OTP
  await db.otpCode.create({
    data: {
      email: normalizedEmail,
      code,
      expiresAt,
    },
  });

  return code;
}

/** Send OTP via Nodemailer with console logging fallback */
export async function deliverOtp(email: string, code: string): Promise<{ sent: boolean; method: "smtp" | "console" }> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const from = process.env.SMTP_FROM || '"Veritas 2FA Security" <security@veritas.local>';

  if (host && user && pass) {
    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      await transporter.sendMail({
        from,
        to: email,
        subject: `[Veritas] Your 2FA Verification Code: ${code}`,
        text: `Your two-factor verification code is: ${code}\n\nThis code expires in 10 minutes.\nIf you did not request this code, please secure your account immediately.`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #090d16; border: 1px solid #1e293b; border-radius: 16px; padding: 32px; color: #e2e8f0;">
            <div style="display: flex; align-items: center; margin-bottom: 24px;">
              <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 10px; width: 40px; height: 40px; line-height: 40px; text-align: center; color: #34d399; font-weight: bold; font-size: 20px;">✓</div>
              <h2 style="margin: 0 0 0 12px; color: #f8fafc; font-size: 20px; font-weight: 600;">Veritas Security</h2>
            </div>
            <p style="margin: 0 0 8px 0; color: #94a3b8; font-size: 14px;">Use the verification code below to complete your sign in:</p>
            <div style="margin: 24px 0; padding: 18px; background: #0f172a; border: 1px solid #334155; border-radius: 12px; text-align: center;">
              <span style="font-size: 34px; font-weight: 700; letter-spacing: 8px; color: #38bdf8; font-family: monospace;">${code}</span>
            </div>
            <p style="margin: 0; color: #64748b; font-size: 13px;">This code will expire in <strong>10 minutes</strong>. If you did not initiate this request, you can safely ignore this email.</p>
          </div>
        `,
      });
      console.log(`[2FA] OTP email successfully dispatched via SMTP to: ${email}`);
      return { sent: true, method: "smtp" };
    } catch (err) {
      console.error("[2FA] SMTP dispatch failed, utilizing console fallback:", err);
    }
  }

  // Fallback logging the OTP to the server console for local development
  console.log("\n" + "=".repeat(64));
  console.log("             >>> 2FA ONE-TIME VERIFICATION CODE <<<             ");
  console.log(` RECIPIENT : ${email}`);
  console.log(` CODE      : [  ${code}  ]`);
  console.log(" EXPIRES IN: 10 minutes (TTL)");
  console.log(" FALLBACK  : SMTP unconfigured; logged for development testing");
  console.log("=".repeat(64) + "\n");

  return { sent: true, method: "console" };
}

/** In-memory rate limiting tracker for OTP resend (at most 1 per 45s) */
const otpRateLimits = new Map<string, number>();

export function checkOtpRateLimit(email: string): { allowed: boolean; remainingSec: number } {
  const normalized = email.trim().toLowerCase();
  const lastSent = otpRateLimits.get(normalized);
  const now = Date.now();
  const cooldownMs = 45 * 1000;

  if (lastSent && now - lastSent < cooldownMs) {
    const remainingSec = Math.ceil((cooldownMs - (now - lastSent)) / 1000);
    return { allowed: false, remainingSec };
  }

  otpRateLimits.set(normalized, now);
  return { allowed: true, remainingSec: 0 };
}

/** Verify OTP code: consumes/deletes on match or fails */
export async function verifyAndConsumeOtp(email: string, code: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  const cleanCode = code.trim();

  const record = await db.otpCode.findFirst({
    where: {
      email: normalizedEmail,
      code: cleanCode,
      expiresAt: { gt: new Date() },
    },
  });

  if (!record) {
    return false;
  }

  // Invalidate/delete the OTP once consumed
  await db.otpCode.delete({ where: { id: record.id } }).catch(() => undefined);
  return true;
}

/** Authenticate user from JWT Bearer token or legacy session token */
export async function userFromToken(token?: string | null): Promise<SafeUser | null> {
  if (!token) return null;
  const cleanToken = token.startsWith("Bearer ") ? token.slice(7).trim() : token.trim();

  // 1. Try JWT
  const jwtUser = verifyJwt(cleanToken);
  if (jwtUser) {
    const dbUser = await db.user.findUnique({ where: { id: jwtUser.id } });
    if (dbUser) {
      return {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role || "user",
      };
    }
  }

  // 2. Try legacy Session
  try {
    const session = await db.session.findUnique({
      where: { id: cleanToken },
      include: { user: true },
    });
    if (session && session.expiresAt.getTime() > Date.now()) {
      return {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: session.user.role || "user",
      };
    }
  } catch {
    /* ignore */
  }

  return null;
}

/** Invalidate/destroy legacy session if needed */
export async function destroySession(token: string): Promise<void> {
  const cleanToken = token.startsWith("Bearer ") ? token.slice(7).trim() : token.trim();
  await db.session.deleteMany({ where: { id: cleanToken } }).catch(() => undefined);
}
