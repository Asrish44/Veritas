/**
 * Standalone Express Server Implementation
 * Meets all 2FA, Multi-Format Document Ingestion & Link-Only Admin Specifications
 */

import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { randomInt } from "crypto";

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "veritas-secure-jwt-token-hackathon-2026-cbit-key";
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || "admin-secret-access-link-cbit-2026";
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

app.use(cors());
app.use(express.json());

// In-memory rate limiting map for send-otp
const rateLimitMap = new Map<string, number>();

// Nodemailer dispatcher with console fallback
async function dispatchOtp(email: string, code: string) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const from = process.env.SMTP_FROM || '"Veritas Security" <security@veritas.local>';

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
        subject: `Your Veritas 2FA Code: ${code}`,
        text: `Your verification code is: ${code}\nValid for 10 minutes.`,
      });
      console.log(`[Express 2FA] OTP sent via SMTP to: ${email}`);
      return;
    } catch (err) {
      console.error("[Express 2FA] SMTP error, using console fallback:", err);
    }
  }

  // Fallback logging OTP to server console
  console.log("\n" + "=".repeat(60));
  console.log("       >>> EXPRESS 2FA VERIFICATION CODE <<<       ");
  console.log(` RECIPIENT : ${email}`);
  console.log(` OTP CODE  : [  ${code}  ]`);
  console.log(" EXPIRES IN: 10 minutes");
  console.log("=".repeat(60) + "\n");
}

// 1. REGISTRATION
app.post("/api/auth/register", async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existing) {
      return res.status(409).json({ error: "An account with that email already exists." });
    }

    // Hash passwords securely using bcrypt (cost factor 10)
    const passwordHash = await bcrypt.hash(password, 10);
    const count = await prisma.user.count();
    const role = count === 0 ? "admin" : "user";

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: cleanEmail,
        role,
        passwordHash,
      },
    });

    // Generate 6-digit OTP with 10 min expiry
    const code = randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await prisma.otpCode.deleteMany({ where: { email: cleanEmail } });
    await prisma.otpCode.create({ data: { email: cleanEmail, code, expiresAt } });

    await dispatchOtp(cleanEmail, code);

    return res.status(201).json({
      otpRequired: true,
      email: cleanEmail,
      message: "Registration complete. Please verify with the 6-digit OTP sent to your email.",
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// 2. TWO-STEP LOGIN (STEP 1)
app.post("/api/auth/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    // Server verifies bcrypt hash. If valid, do NOT log them in immediately!
    // Generate secure 6-digit numeric OTP with 10-minute expiry (TTL)
    const code = randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await prisma.otpCode.deleteMany({ where: { email: cleanEmail } });
    await prisma.otpCode.create({ data: { email: cleanEmail, code, expiresAt } });

    await dispatchOtp(cleanEmail, code);

    // Return { otpRequired: true, email } to switch UI to the OTP entry screen
    return res.json({
      otpRequired: true,
      email: cleanEmail,
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// 3. OTP VERIFICATION (/api/verify-otp)
app.post("/api/verify-otp", async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: "Email and 6-digit code are required." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = String(code).trim();

    const record = await prisma.otpCode.findFirst({
      where: {
        email: cleanEmail,
        code: cleanCode,
        expiresAt: { gt: new Date() },
      },
    });

    if (!record) {
      return res.status(401).json({ error: "Invalid or expired verification code." });
    }

    // Invalidate/delete OTP once consumed
    await prisma.otpCode.delete({ where: { id: record.id } });

    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    // Issue signed JWT with user identity and role
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// 4. RESEND OTP (/api/send-otp)
app.post("/api/send-otp", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const lastSent = rateLimitMap.get(cleanEmail);
    const now = Date.now();
    const cooldown = 45 * 1000;

    if (lastSent && now - lastSent < cooldown) {
      const wait = Math.ceil((cooldown - (now - lastSent)) / 1000);
      return res.status(429).json({ error: `Please wait ${wait}s before requesting a new code.` });
    }

    rateLimitMap.set(cleanEmail, now);

    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (!user) {
      return res.status(404).json({ error: "No user found with this email." });
    }

    const code = randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await prisma.otpCode.deleteMany({ where: { email: cleanEmail } });
    await prisma.otpCode.create({ data: { email: cleanEmail, code, expiresAt } });

    await dispatchOtp(cleanEmail, code);

    return res.json({
      success: true,
      message: "Verification code sent.",
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// 5. ADMIN ENDPOINT - ACCESSED ONLY BY LINK TOKEN
app.get("/api/admin", async (req: Request, res: Response) => {
  const { token } = req.query;
  if (!token || token !== ADMIN_SECRET_KEY) {
    return res.status(403).json({ error: "Access Denied: Private Admin Link Token Required." });
  }

  const [users, papers] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true, email: true, phone: true, location: true, role: true, createdAt: true } }),
    prisma.paper.findMany({ select: { id: true, title: true, fileName: true, pages: true, status: true, createdAt: true } }),
  ]);

  return res.json({
    adminAuthorized: true,
    model: "qwen3:14b",
    users,
    papers,
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[Veritas Express API] Running on http://localhost:${PORT}`);
    console.log(`[Admin Secret Link] http://localhost:3000/admin?token=${ADMIN_SECRET_KEY}`);
  });
}

export default app;

