"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

const inputClass =
  "h-11 w-full rounded-xl border border-transparent bg-sunken/60 px-3.5 text-sm text-fg outline-none transition placeholder:text-subtle focus:border-accent/50 focus:bg-raised focus:ring-4 focus:ring-accent/15";

export function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [answer, setAnswer] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadCaptcha = useCallback(async () => {
    try {
      const r = await fetch("/api/captcha?for=login", { cache: "no-store" });
      const j = (await r.json().catch(() => null)) as { image?: string } | null;
      setImage(j?.image ?? null);
    } catch {
      setImage(null);
    }
  }, []);

  useEffect(() => {
    // Fetching the first captcha on mount syncs with the server; the setState runs after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCaptcha();
  }, [loadCaptcha]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, captchaAnswer: answer }),
      });
      if (resp.ok) {
        window.location.reload();
        return;
      }
      const j = (await resp.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(j?.error?.message ?? "Sign-in failed.");
      setAnswer("");
      void loadCaptcha();
    } catch {
      setError("Sign-in failed.");
      void loadCaptcha();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-line bg-surface/80 p-6 shadow-sm">
        <h1 className="text-lg font-semibold">Sign in</h1>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" autoComplete="username" autoCapitalize="none" spellCheck={false} className={inputClass} />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" autoComplete="current-password" className={inputClass} />
        <div className="flex items-center gap-3">
          <div className="flex h-[70px] w-[200px] items-center justify-center overflow-hidden rounded-lg border border-line bg-raised">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="Robot check" width={200} height={70} />
            ) : (
              <span className="text-xs text-subtle">…</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setImage(null);
              void loadCaptcha();
            }}
            className="text-xs text-accent hover:underline"
          >
            New image
          </button>
        </div>
        <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type the characters" autoComplete="off" spellCheck={false} maxLength={8} className={`${inputClass} font-mono tracking-widest`} />
        {error && <p className="text-sm text-dangerous">{error}</p>}
        <button type="submit" disabled={busy} className="h-11 w-full rounded-xl bg-gradient-to-r from-accent to-accent-2 font-semibold text-on-accent shadow-lg shadow-accent/25 disabled:opacity-50">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
