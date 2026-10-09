import Link from "next/link";

import type { ScanSummary } from "@/lib/scan-store";

import { VerdictBadge } from "./verdict";

// Stored summaries come from our own sanitized reports; React escapes them.

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

export function RepoList({ items, showReasons }: { items: ScanSummary[]; showReasons: boolean }) {
  return (
    <ul className="space-y-3">
      {items.map((s) => {
        const [owner, repo] = s.fullName.split("/");
        return (
          <li key={s.fullName}>
            <Link
              href={`/scan/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`}
              className="block rounded-xl border border-slate-800 bg-slate-900/30 p-4 transition hover:border-slate-600 hover:bg-slate-900/60"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <VerdictBadge verdict={s.verdict} />
                <span className="font-mono font-medium break-all text-slate-100">{s.fullName}</span>
                <span className="font-mono text-xs text-slate-500">score {s.score}</span>
                <span className="ml-auto text-xs text-slate-500">{formatDate(s.scannedAt)}</span>
              </div>
              {s.description && <p className="mt-2 line-clamp-2 text-sm text-slate-400">{s.description}</p>}
              {showReasons && s.topRules.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {s.topRules.map((r) => (
                    <li key={r.id} className="rounded-md bg-rose-500/10 px-2 py-0.5 text-xs text-rose-200 ring-1 ring-rose-400/20">
                      {r.title} <span className="font-mono text-rose-300/70">+{r.points}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 font-mono text-[11px] text-slate-600">
                commit {s.headSha.slice(0, 12)} · {s.findings} finding{s.findings === 1 ? "" : "s"} · {s.stars} stars
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function EmptyList({ configured, children }: { configured: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">
      {configured ? (
        children
      ) : (
        <>
          <p className="font-medium text-slate-300">The database is not connected yet.</p>
          <p className="mt-1">
            Scans still work, but nothing is stored. Add a Postgres database (Neon) in the Vercel project&apos;s Storage
            tab to fill this list.
          </p>
        </>
      )}
    </div>
  );
}
