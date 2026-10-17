"use client";

import { type FormEvent, useState } from "react";

const inputClass =
  "h-11 w-full rounded-xl border border-transparent bg-sunken/60 px-3.5 text-sm text-fg outline-none transition placeholder:text-subtle focus:border-accent/50 focus:bg-raised focus:ring-4 focus:ring-accent/15";

export function AdminSetup({ configured }: { configured: boolean }) {
  const [setupToken, setSetupToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!configured) {
    return (
      <div className="mx-auto max-w-sm rounded-2xl border border-line bg-surface/80 p-6 text-sm text-muted shadow-sm">
        Storage is not configured, so the admin account cannot be created yet.
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupToken, username, password }),
      });
      if (resp.ok) {
        window.location.reload();
        return;
      }
      const j = (await resp.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(j?.error?.message ?? "Setup failed.");
    } catch {
      setError("Setup failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-line bg-surface/80 p-6 shadow-sm">
        <div>
          <h1 className="text-lg font-semibold">First-time setup</h1>
          <p className="mt-1 text-xs text-muted">Create the admin account once. Needs the setup key from the hosting environment.</p>
        </div>
        <input value={setupToken} onChange={(e) => setSetupToken(e.target.value)} placeholder="Setup key" type="password" autoComplete="off" className={inputClass} />
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="New username" autoComplete="off" autoCapitalize="none" spellCheck={false} className={inputClass} />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password (min 10 chars)" type="password" autoComplete="new-password" className={inputClass} />
        {error && <p className="text-sm text-dangerous">{error}</p>}
        <button type="submit" disabled={busy} className="h-11 w-full rounded-xl bg-gradient-to-r from-accent to-accent-2 font-semibold text-on-accent shadow-lg shadow-accent/25 disabled:opacity-50">
          {busy ? "Creating…" : "Create admin account"}
        </button>
      </form>
    </div>
  );
}
