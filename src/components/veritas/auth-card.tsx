"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface Props {
  onSuccess: (token: string, user: AuthUser) => void;
  onBack: () => void;
  onSkip: () => void;
}

export function AuthCard({ onSuccess, onBack, onSkip }: Props) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"login" | "register">("login");

  // Step 1: Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Step 2: 2FA OTP state
  const [isOtpStep, setIsOtpStep] = useState(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [resendCooldown, setResendCooldown] = useState(0);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // References for segmented inputs
  const digitInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Timer countdown for resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Auto-focus first digit input when entering OTP step
  useEffect(() => {
    if (isOtpStep) {
      setTimeout(() => {
        digitInputRefs.current[0]?.focus();
      }, 150);
    }
  }, [isOtpStep]);

  // Step 1 Submit: Validate credentials and trigger 2FA OTP
  const handleSubmitStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: mode,
          name,
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Authentication failed.");
        return;
      }

      // Step 2 transition: Server verified credentials and issued OTP
      if (data.otpRequired) {
        setIsOtpStep(true);
        setResendCooldown(45);
        toast({
          title: "Verification code sent",
          description: `A 6-digit code was sent to ${data.email}. Valid for 10 minutes.`,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  // Step 2 Submit: Verify 6-digit OTP code
  const handleVerifyOtp = async (codeToVerify?: string) => {
    const code = codeToVerify || otpDigits.join("");
    if (code.length !== 6) {
      setError("Please enter the complete 6-digit verification code.");
      return;
    }

    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Verification failed. The code may have expired or is incorrect.");
        return;
      }

      // Requirement 4: Save the JWT in sessionStorage and attach it as a Bearer token
      sessionStorage.setItem("veritas_jwt", data.token);
      sessionStorage.setItem("veritas_user", JSON.stringify(data.user));
      localStorage.setItem("veritas_token", data.token);

      toast({
        title: "Authentication Verified",
        description: `Welcome, ${data.user.name}! 2FA verification successful.`,
      });

      onSuccess(data.token, data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  // Resend OTP endpoint call
  const handleResendOtp = async () => {
    if (resendCooldown > 0 || busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to resend code.");
        if (data.retryAfter) {
          setResendCooldown(data.retryAfter);
        }
        return;
      }

      setResendCooldown(45);
      setOtpDigits(["", "", "", "", "", ""]);
      digitInputRefs.current[0]?.focus();

      toast({
        title: "Code Dispatched",
        description: "A fresh 6-digit verification code has been sent.",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  // Segmented OTP Input handlers
  const handleDigitChange = (index: number, value: string) => {
    // Only accept numeric characters
    const cleanVal = value.replace(/\D/g, "");
    if (!cleanVal && value !== "") return;

    const newDigits = [...otpDigits];
    const lastChar = cleanVal.slice(-1);
    newDigits[index] = lastChar;
    setOtpDigits(newDigits);

    // Auto-focus next input
    if (lastChar && index < 5) {
      digitInputRefs.current[index + 1]?.focus();
    }

    // If all 6 digits entered, auto-verify
    if (newDigits.every((d) => d !== "")) {
      void handleVerifyOtp(newDigits.join(""));
    }
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (otpDigits[index] === "" && index > 0) {
        const newDigits = [...otpDigits];
        newDigits[index - 1] = "";
        setOtpDigits(newDigits);
        digitInputRefs.current[index - 1]?.focus();
      } else {
        const newDigits = [...otpDigits];
        newDigits[index] = "";
        setOtpDigits(newDigits);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      digitInputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      digitInputRefs.current[index + 1]?.focus();
    }
  };

  const handleDigitPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData("text").trim();
    const cleanNumbers = pastedText.replace(/\D/g, "").slice(0, 6);

    if (cleanNumbers.length > 0) {
      const newDigits = [...otpDigits];
      for (let i = 0; i < cleanNumbers.length && i < 6; i++) {
        newDigits[i] = cleanNumbers[i];
      }
      setOtpDigits(newDigits);

      // Focus appropriate input
      const nextIndex = Math.min(cleanNumbers.length, 5);
      digitInputRefs.current[nextIndex]?.focus();

      // If full 6 digits pasted, auto-trigger verification
      if (cleanNumbers.length === 6) {
        void handleVerifyOtp(cleanNumbers);
      }
    }
  };

  return (
    <div className="dark relative flex min-h-screen flex-col bg-slate-950 text-slate-100">
      {/* Background glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-[-260px] h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.07)_1px,transparent_0)] [background-size:28px_28px]" />
      </div>

      <header className="relative z-10 border-b border-slate-800/70">
        <div className="mx-auto flex max-w-5xl items-center px-4 py-3 sm:px-6">
          <Button size="sm" variant="ghost" className="gap-1.5 text-slate-400" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          {/* Header branding */}
          <div className="mb-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600/15 border border-emerald-500/40 shadow-lg shadow-emerald-950/30">
              {isOtpStep ? <KeyRound className="h-6 w-6 text-emerald-400" /> : <ShieldCheck className="h-6 w-6 text-emerald-400" />}
            </div>
            <h1 className="mt-4 text-xl font-semibold tracking-tight">
              {isOtpStep ? "Two-Factor Verification" : mode === "login" ? "Sign In to Veritas" : "Create Veritas Account"}
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              {isOtpStep
                ? `Enter the 6-digit code sent to ${email}`
                : mode === "login"
                ? "Enter your credentials to initiate 2FA login."
                : "Register with name, email & password."}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-2xl shadow-emerald-950/20 backdrop-blur transition-all">
            {/* STEP 1: Registration or Login Form */}
            {!isOtpStep ? (
              <>
                {/* Mode toggle */}
                <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-950/80 p-1">
                  {(["login", "register"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setMode(m);
                        setError(null);
                      }}
                      className={`rounded-lg py-1.5 text-xs font-medium transition-colors ${
                        mode === m ? "bg-slate-800 text-slate-100 shadow" : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {m === "login" ? "Sign In" : "Register"}
                    </button>
                  ))}
                </div>

                <form className="space-y-3.5" onSubmit={handleSubmitStep1}>
                  {mode === "register" && (
                    <div>
                      <label htmlFor="auth-name" className="mb-1 block text-[11px] font-medium text-slate-400">
                        Full Name
                      </label>
                      <div className="relative">
                        <UserIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                        <input
                          id="auth-name"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Ada Lovelace"
                          autoComplete="name"
                          className="h-9 w-full rounded-xl border border-slate-800 bg-slate-950/80 pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label htmlFor="auth-email" className="mb-1 block text-[11px] font-medium text-slate-400">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                      <input
                        id="auth-email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="researcher@lab.edu"
                        autoComplete="email"
                        className="h-9 w-full rounded-xl border border-slate-800 bg-slate-950/80 pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="auth-password" className="mb-1 block text-[11px] font-medium text-slate-400">
                      Password
                    </label>
                    <input
                      id="auth-password"
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === "register" ? "At least 6 characters (bcrypt protected)" : "••••••••"}
                      autoComplete={mode === "register" ? "new-password" : "current-password"}
                      className="h-9 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  {error && (
                    <p role="alert" className="rounded-lg border border-rose-800/60 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">
                      {error}
                    </p>
                  )}

                  <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium" disabled={busy}>
                    {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                    {mode === "login" ? "Verify Credentials & Send OTP" : "Register with 2FA"}
                  </Button>
                </form>
              </>
            ) : (
              /* STEP 2: SEGMENTED 6-DIGIT OTP INPUT */
              <div className="space-y-4">
                <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-3 text-xs text-emerald-300">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>Credentials confirmed. Please enter your 6-digit code:</span>
                  </div>
                </div>

                {/* Segmented Inputs */}
                <div className="flex justify-between gap-2 my-2">
                  {otpDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => {
                        digitInputRefs.current[idx] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleDigitChange(idx, e.target.value)}
                      onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                      onPaste={handleDigitPaste}
                      className="h-13 w-12 rounded-xl border-2 border-slate-800 bg-slate-950 text-center text-xl font-bold font-mono text-emerald-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                      aria-label={`Digit ${idx + 1}`}
                    />
                  ))}
                </div>



                {error && (
                  <p role="alert" className="rounded-lg border border-rose-800/60 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">
                    {error}
                  </p>
                )}

                <Button
                  onClick={() => handleVerifyOtp()}
                  disabled={busy || otpDigits.some((d) => d === "")}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                >
                  {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1.5 h-4 w-4" />}
                  Verify OTP & Log In
                </Button>

                {/* Resend & Back actions */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setIsOtpStep(false);
                      setError(null);
                    }}
                    className="text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    ← Change Email / Back
                  </button>

                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resendCooldown > 0 || busy}
                    className={`flex items-center gap-1 font-medium transition-colors ${
                      resendCooldown > 0 ? "text-slate-600 cursor-not-allowed" : "text-emerald-400 hover:text-emerald-300"
                    }`}
                  >
                    <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />
                    {resendCooldown > 0 ? `Resend Code (${resendCooldown}s)` : "Resend Code"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 text-center">
            <button onClick={onSkip} className="text-xs text-slate-500 transition-colors hover:text-emerald-400">
              Explore without an account →
            </button>
          </div>

          <p className="mt-3 text-center text-[10px] leading-relaxed text-slate-600">
            Secure Two-Factor Authentication with bcrypt password hashing and 10-minute numeric OTP.
          </p>
        </div>
      </main>
    </div>
  );
}
