"use client";

import { useState } from "react";

import { DEFAULT_LOCALE, scanPath } from "@/i18n/config";
import type { FalseReport } from "@/lib/report-store";

/** All text here is sanitized before storage; React escapes it. Read-only. */
export function ReportsTable({ reports }: { reports: FalseReport[] }) {
  const [openId, setOpenId] = useState<number | null>(null);

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface/80">
      <table className="w-full text-left text-sm">
        <thead className="bg-sunken/60 text-xs text-subtle">
          <tr>
            <th className="w-6 px-2 py-2" />
            <th className="px-4 py-2 font-medium">When</th>
            <th className="px-4 py-2 font-medium">Repository</th>
            <th className="px-4 py-2 font-medium">Verdict</th>
            <th className="px-4 py-2 font-medium">Engine</th>
            <th className="px-4 py-2 font-medium">Why it is wrong</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => {
            const open = openId === r.id;
            const slash = r.fullName.indexOf("/");
            const owner = slash > 0 ? r.fullName.slice(0, slash) : "";
            const repo = slash > 0 ? r.fullName.slice(slash + 1) : "";
            const scanHref = owner && repo ? scanPath(DEFAULT_LOCALE, owner, repo) : null;
            return (
              <ReportRows
                key={r.id}
                report={r}
                open={open}
                onToggle={() => setOpenId(open ? null : r.id)}
                scanHref={scanHref}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ReportRows({
  report: r,
  open,
  onToggle,
  scanHref,
}: {
  report: FalseReport;
  open: boolean;
  onToggle: () => void;
  scanHref: string | null;
}) {
  const fullWhen = new Date(r.createdAt).toISOString().replace("T", " ").slice(0, 19);
  return (
    <>
      <tr
        onClick={onToggle}
        aria-expanded={open}
        className="cursor-pointer border-t border-line align-top transition-colors hover:bg-raised/50"
      >
        <td className="px-2 py-3 text-subtle">
          <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true">
            ›
          </span>
        </td>
        <td className="px-4 py-3 text-xs whitespace-nowrap text-subtle">{fullWhen.slice(0, 16)}</td>
        <td className="px-4 py-3 font-mono text-xs break-all text-fg">
          <span>
            {r.fullName}
            {r.repoCount > 1 && (
              <span className="ml-2 rounded-full bg-sunken px-1.5 py-0.5 text-[10px] font-semibold text-muted">×{r.repoCount}</span>
            )}
          </span>
          {r.headSha && <span className="block text-subtle">@ {r.headSha.slice(0, 12)}</span>}
        </td>
        <td className="px-4 py-3 text-xs whitespace-nowrap text-fg">
          {r.verdict} ({r.score})
        </td>
        <td className="px-4 py-3 text-xs whitespace-nowrap text-subtle">{r.engineVersion}</td>
        <td className="max-w-xs truncate px-4 py-3 text-sm text-fg">{r.reason}</td>
      </tr>
      {open && (
        <tr className="border-t border-line/60 bg-raised/30">
          <td />
          <td colSpan={5} className="px-4 py-4">
            <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <Field label="Submitted (UTC)">{fullWhen}</Field>
              <Field label="Reports for this repo">{r.repoCount}</Field>
              <Field label="Repository">
                <span className="font-mono break-all">{r.fullName}</span>
                {scanHref && (
                  <a href={scanHref} target="_blank" rel="noopener noreferrer" className="ml-2 text-accent hover:underline">
                    Open scan ↗
                  </a>
                )}
              </Field>
              <Field label="Reporter (anonymous)">
                <span className="font-mono text-xs">{r.clientLabel}</span>
              </Field>
              <Field label="Commit">
                <span className="font-mono text-xs break-all">{r.headSha || "—"}</span>
              </Field>
              <Field label="Verdict / engine">
                {r.verdict} ({r.score}) · {r.engineVersion}
              </Field>
            </dl>
            <div className="mt-4">
              <dt className="text-xs font-medium text-subtle">Why it is wrong</dt>
              <dd className="mt-1 rounded-xl border border-line bg-surface/70 p-3 text-sm whitespace-pre-wrap break-words text-fg">{r.reason}</dd>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-subtle">{label}</dt>
      <dd className="mt-0.5 text-sm text-fg">{children}</dd>
    </div>
  );
}
