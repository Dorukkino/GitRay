"use client";

import { useState } from "react";

export function AdminLogout() {
  const [busy, setBusy] = useState(false);

  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {
      // ignore; reload anyway
    }
    window.location.reload();
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={busy}
      className="rounded-full bg-sunken px-3 py-1.5 text-xs text-fg transition-colors hover:bg-line disabled:opacity-50"
    >
      Sign out
    </button>
  );
}
