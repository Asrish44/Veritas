"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Landing } from "./landing";
import { AuthCard, type AuthUser } from "./auth-card";
import { ChatView } from "./chat-view";

const TOKEN_KEY = "veritas_token";
const JWT_KEY = "veritas_jwt";

type View = "landing" | "auth" | "chat";

/**
 * Client-side view router — landing → auth → chat are switched here.
 * Checks sessionStorage for the 2FA JWT Bearer token, with localStorage fallback.
 */
export function AppShell() {
  const [view, setView] = useState<View>("landing");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let alive = true;
    const boot = async () => {
      // Check sessionStorage first as per spec, fallback to localStorage
      const token =
        (typeof window !== "undefined" && (sessionStorage.getItem(JWT_KEY) || localStorage.getItem(TOKEN_KEY))) || null;

      if (!token) {
        setBooting(false);
        return;
      }

      try {
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action: "me", token }),
        });
        const data = res.ok ? await res.json() : null;
        if (!alive) return;
        if (data?.user) {
          setUser(data.user);
          setView("chat");
        } else {
          sessionStorage.removeItem(JWT_KEY);
          localStorage.removeItem(TOKEN_KEY);
        }
      } catch {
        /* ignore */
      } finally {
        if (alive) setBooting(false);
      }
    };
    void boot();
    return () => {
      alive = false;
    };
  }, []);

  const handleAuthSuccess = useCallback((token: string, u: AuthUser) => {
    sessionStorage.setItem(JWT_KEY, token);
    localStorage.setItem(TOKEN_KEY, token);
    setUser(u);
    setView("chat");
  }, []);

  const handleSignOut = useCallback(async () => {
    const token = sessionStorage.getItem(JWT_KEY) || localStorage.getItem(TOKEN_KEY);
    if (token) {
      await fetch("/api/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "logout", token }),
      }).catch(() => undefined);
    }
    sessionStorage.removeItem(JWT_KEY);
    sessionStorage.removeItem("veritas_user");
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setView("landing");
  }, []);

  if (booting) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600/15 ring-1 ring-emerald-500/40">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
          </div>
          <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
        </div>
      </div>
    );
  }

  if (view === "landing") {
    return <Landing onSignIn={() => setView("auth")} onGetStarted={() => setView("auth")} />;
  }

  if (view === "auth") {
    return <AuthCard onSuccess={handleAuthSuccess} onBack={() => setView("landing")} onSkip={() => setView("chat")} />;
  }

  return <ChatView user={user} onSignIn={() => setView("auth")} onSignOut={() => void handleSignOut()} />;
}
