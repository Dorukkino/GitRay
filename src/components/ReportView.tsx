"use client";

import { useMemo, useState } from "react";

import type { Category, Report, ReportFinding, Severity } from "@/engine";

import { CATEGORY_LABEL, CATEGORY_ORDER, SEVERITY_STYLE, ScoreGauge, VERDICT_STYLE, VerdictBadge } from "./verdict";

// Everything shown here comes from the report, where repository-controlled
// strings are already sanitized. React escapes all of it; nothing is rendered
// as HTML and no link points at a URL taken from the repository.

const LIMIT_LABEL: Record<string, string> = {
  maxRepoSizeKb: "repository size",
  maxDownloadBytes: "download size",
  maxEntries: "number of files",
  maxFileBytes: "file size",
  maxTotalBytes: "unpacked size",
  timeBudgetMs: "time budget",
  maxHiddenFiles: "hidden files",
};

/** What the OSV dependency check found. */
function dependencyCheckText(report: Report): { text: string; warn: boolean } | null {
  // Reports stored before this check existed have no dependencyCheck.
  const check = report.dependencyCheck;
  if (!check) return null;
  const packages = `${check.packages} package${check.packages === 1 ? "" : "s"}`;
  switch (check.status) {
    case "ok":
      return { text: `Checked ${packages} against OSV's malicious-package list: none is known malware.`, warn: false };
    case "found":
      return { text: `${check.malicious} of ${packages} declared here are known malware according to OSV.`, warn: true };
    case "unavailable":
      return { text: "OSV could not be reached, so dependencies were not checked against known malware.", warn: true };
    default:
      return null;
  }
}

/** What the comparison of GitHub's archive with the commit's file list found. */
function archiveCheckText(report: Report): { text: string; warn: boolean } | null {
  // Reports stored before this check existed have no archiveCheck.
  const check = report.archiveCheck;
  if (!check) return null;
  switch (check.status) {
    case "ok":
      return { text: "GitHub's download archive holds every file of this commit.", warn: false };
    case "hidden":
      return {
        text:
          `${check.hidden} file${check.hidden === 1 ? " is" : "s are"} left out of GitHub's download archive ` +
          `(.gitattributes export-ignore) but still arrive with git clone. GitRay downloaded and scanned ` +
          `${check.scanned} of them separately.`,
        warn: check.scanned < check.hidden,
      };
    case "unavailable":
      return {
        text: "GitHub did not return the commit's full file list, so files hidden from the download archive could not be checked.",
        warn: true,
      };
    default:
      return null;
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Age at scan time (deterministic, so server and browser render the same text). */
function age(iso: string | null, scannedAt: string): string {
  if (!iso) return "unknown";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "unknown";
  const days = Math.floor((Date.parse(scannedAt) - t) / 86_400_000);
  if (days < 1) return "today";
  if (days < 60) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (days < 730) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
      <div className="text-[11px] tracking-wide text-slate-500 uppercase">{label}</div>
      <div className="mt-0.5 truncate font-mono text-sm text-slate-200" title={value}>
        {value}
      </div>
    </div>
  );
}

function SeverityPill({ severity }: { severity: Severity }) {
  return (
    <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase ring-1 ${SEVERITY_STYLE[severity]}`}>
      {severity}
    </span>
  );
}

function FindingCard({ f }: { f: ReportFinding }) {
  const where = f.path ? `${f.path}${f.line > 0 ? `:${f.line}` : ""}` : "Repository metadata";
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityPill severity={f.severity} />
        <h4 className="font-medium text-slate-100">{f.title}</h4>
        <span className="font-mono text-xs text-slate-500">
          {f.ruleId} · +{f.weight}
        </span>
        {f.docContext && (
          <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400">in documentation, weight reduced</span>
        )}
        {f.inArchive && (
          <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400">inside a ZIP file</span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-mono break-all text-cyan-200/90">{where}</span>
        {f.githubUrl && (
          <a
            href={f.githubUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-xs text-slate-400 underline decoration-slate-600 underline-offset-2 hover:text-slate-200"
          >
            view on GitHub
          </a>
        )}
      </div>
      {f.note && <p className="mt-1.5 text-sm text-slate-300">{f.note}</p>}
      {f.snippet && (
        <pre className="mt-3 overflow-x-auto rounded-lg border border-slate-800 bg-[#05080d] p-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-all text-slate-200">
          {f.snippet}
        </pre>
      )}
      <details className="group mt-3">
        <summary className="cursor-pointer list-none text-sm text-slate-400 select-none hover:text-slate-200">
          <span className="mr-1 inline-block transition group-open:rotate-90">›</span>
          Why this matters
        </summary>
        <p className="mt-2 pl-4 text-sm leading-relaxed text-slate-400">{f.why}</p>
      </details>
    </article>
  );
}

function downloadJson(report: Report) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gitray-${(report.target?.fullName ?? "report").replace("/", "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReportView({ report }: { report: Report }) {
  const [category, setCategory] = useState<Category | "all">("all");
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const style = VERDICT_STYLE[report.verdict];
  const t = report.target;

  const categories = useMemo(() => {
    const present = new Set(report.findings.map((f) => f.category));
    return CATEGORY_ORDER.filter((c) => present.has(c));
  }, [report.findings]);

  const shown = report.findings.filter(
    (f) => (category === "all" || f.category === category) && (severity === "all" || f.severity === severity),
  );
  const grouped = CATEGORY_ORDER.map((c) => [c, shown.filter((f) => f.category === c)] as const).filter(
    ([, list]) => list.length > 0,
  );
  const filesScanned = report.stats.textFiles + report.stats.binaryFiles;
  const archiveMembers = report.stats.archiveMembers ?? 0;
  const archiveCheck = archiveCheckText(report);
  const dependencyCheck = dependencyCheckText(report);

  return (
    <div className="space-y-8">
      {/* Summary */}
      <section className={`rounded-2xl border border-slate-800 bg-slate-900/30 p-5 ring-1 sm:p-6 ${style.ring}`}>
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          <div className="flex items-center gap-5">
            <ScoreGauge score={report.score} verdict={report.verdict} />
            <div className="md:hidden">
              <VerdictBadge verdict={report.verdict} size="lg" />
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="hidden md:block">
                <VerdictBadge verdict={report.verdict} size="lg" />
              </div>
              {!report.complete && (
                <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-xs font-medium text-sky-300 ring-1 ring-sky-400/30">
                  Partial scan
                </span>
              )}
            </div>
            {t ? (
              <div>
                <h1 className="font-mono text-xl font-semibold break-all text-slate-50 sm:text-2xl">
                  <a href={t.url} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline">
                    {t.fullName}
                  </a>
                </h1>
                {t.description && <p className="mt-1 text-sm text-slate-400">{t.description}</p>}
              </div>
            ) : (
              <h1 className="text-xl font-semibold text-slate-50">Scan result</h1>
            )}
            <p className="max-w-3xl text-sm leading-relaxed text-slate-300">{style.summary}</p>
          </div>
        </div>

        {t && (
          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Commit" value={t.headSha.slice(0, 12)} />
            <Stat label="Branch" value={t.defaultBranch} />
            <Stat label="Repo created" value={age(t.createdAt, report.startedAt)} />
            <Stat label="Owner since" value={age(t.owner.createdAt, report.startedAt)} />
            <Stat label="Stars / forks" value={`${t.stars} / ${t.forks}`} />
            <Stat label="Files scanned" value={`${filesScanned}`} />
          </div>
        )}
        <p className="mt-4 text-xs text-slate-500">
          {report.rulesRun} rules · {formatBytes(report.stats.downloadedBytes)} downloaded,{" "}
          {formatBytes(report.stats.decompressedBytes)} unpacked in memory · {report.stats.binaryFiles} binary files
          inspected by header only
          {archiveMembers > 0 && (
            <>
              {" "}
              · {archiveMembers} files read from inside {report.stats.archivesOpened} ZIP archive
              {report.stats.archivesOpened === 1 ? "" : "s"}
            </>
          )}
          {(report.stats.archivesSkipped ?? 0) > 0 && <> · {report.stats.archivesSkipped} ZIP archives too large to open</>}{" "}
          · {(report.durationMs / 1000).toFixed(1)} s · scanned {new Date(report.startedAt).toUTCString()}
        </p>
        {archiveCheck && (
          <p className={`mt-2 text-xs ${archiveCheck.warn ? "text-amber-300/90" : "text-slate-500"}`}>{archiveCheck.text}</p>
        )}
        {dependencyCheck && (
          <p className={`mt-1 text-xs ${dependencyCheck.warn ? "text-amber-300/90" : "text-slate-500"}`}>{dependencyCheck.text}</p>
        )}
      </section>

      {report.partial && (
        <section className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 text-sm text-sky-100">
          <strong className="font-semibold">Partial scan.</strong> The {LIMIT_LABEL[report.partial.limit] ?? report.partial.limit}{" "}
          limit stopped the scan ({report.partial.reason}) after {report.partial.filesScanned} files. Attackers can hide a
          payload behind large files, so a partial scan is never reported as clean.
        </section>
      )}

      {/* Score breakdown */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-100">Score breakdown</h2>
        {report.rules.length === 0 ? (
          <p className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 text-sm text-slate-400">
            No rule matched. Score 0.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <tbody>
                {report.rules.map((r) => (
                  <tr key={r.id} className="border-b border-slate-800/80 last:border-0">
                    <td className="w-16 px-3 py-2 text-right font-mono font-semibold text-slate-100">+{r.points}</td>
                    <td className="px-3 py-2">
                      <div className="text-slate-200">{r.title}</div>
                      <div className="font-mono text-xs text-slate-500">
                        {r.id} · {CATEGORY_LABEL[r.category]} · {r.findings} finding{r.findings === 1 ? "" : "s"}
                      </div>
                    </td>
                    <td className="hidden w-1/3 px-3 py-2 sm:table-cell">
                      <div className="h-1.5 rounded-full bg-slate-800">
                        <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, r.points * 2)}%`, background: style.stroke }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Each rule adds its strongest finding once; the total is capped at 100. Clean below 30, suspicious from 30,
          dangerous from 70.
        </p>
      </section>

      {/* Findings */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-100">
            Findings <span className="text-slate-500">({report.findings.length + report.omittedFindings})</span>
          </h2>
          {report.findings.length > 0 && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              {(["all", ...categories] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`rounded-full px-2.5 py-1 ring-1 transition ${
                    category === c ? "bg-cyan-400/15 text-cyan-200 ring-cyan-400/40" : "text-slate-400 ring-slate-700 hover:text-slate-200"
                  }`}
                >
                  {c === "all" ? "All" : CATEGORY_LABEL[c]}
                </button>
              ))}
              <span className="mx-1 w-px bg-slate-800" />
              {(["all", "high", "medium", "low"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeverity(s)}
                  className={`rounded-full px-2.5 py-1 ring-1 transition ${
                    severity === s ? "bg-cyan-400/15 text-cyan-200 ring-cyan-400/40" : "text-slate-400 ring-slate-700 hover:text-slate-200"
                  }`}
                >
                  {s === "all" ? "Any severity" : s[0].toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          )}
        </div>
        {report.findings.length === 0 ? (
          <p className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 text-sm text-slate-400">
            Nothing to report. GitRay checked install hooks, build files, code patterns, hidden content, links and
            binaries.
          </p>
        ) : (
          <div className="space-y-6">
            {grouped.map(([cat, list]) => (
              <div key={cat}>
                <h3 className="mb-2 text-sm font-semibold tracking-wide text-slate-400 uppercase">{CATEGORY_LABEL[cat]}</h3>
                <div className="space-y-3">
                  {list.map((f, i) => (
                    <FindingCard key={`${f.ruleId}-${f.path}-${f.line}-${i}`} f={f} />
                  ))}
                </div>
              </div>
            ))}
            {shown.length === 0 && <p className="text-sm text-slate-500">No findings match the filters.</p>}
            {report.omittedFindings > 0 && (
              <p className="text-sm text-slate-500">
                {report.omittedFindings} weaker findings are not listed to keep the report readable; they do not change
                the score.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Release assets */}
      {report.releaseAssets.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold text-slate-100">Release files</h2>
          <p className="mb-3 text-sm text-slate-400">
            Release files are never downloaded. GitHub reports a SHA-256 digest for newer uploads; you can look it up on
            VirusTotal. Without a digest the file cannot be checked.
          </p>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-slate-900/60 text-left text-xs text-slate-400 uppercase">
                <tr>
                  <th className="px-3 py-2 font-medium">Release</th>
                  <th className="px-3 py-2 font-medium">File</th>
                  <th className="px-3 py-2 font-medium">Size</th>
                  <th className="px-3 py-2 font-medium">SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {report.releaseAssets.map((a, i) => (
                  <tr key={`${a.releaseTag}-${a.name}-${i}`} className="border-t border-slate-800/80">
                    <td className="px-3 py-2 font-mono text-slate-300">{a.releaseTag}</td>
                    <td className="px-3 py-2 font-mono break-all text-slate-200">{a.name}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-400">{formatBytes(a.size)}</td>
                    <td className="px-3 py-2">
                      {a.sha256 ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="font-mono text-xs text-slate-400" title={a.sha256}>
                            {a.sha256.slice(0, 16)}…
                          </code>
                          {a.virusTotalUrl && (
                            <a
                              href={a.virusTotalUrl}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="text-xs text-cyan-300 underline underline-offset-2 hover:text-cyan-200"
                            >
                              check on VirusTotal
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-amber-300/90">no digest: cannot be checked</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Raw JSON */}
      <section>
        <details className="group rounded-xl border border-slate-800 bg-slate-900/30">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm text-slate-300 select-none">
            <span>
              <span className="mr-1 inline-block transition group-open:rotate-90">›</span> Raw JSON report
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                downloadJson(report);
              }}
              className="rounded-md bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-700"
            >
              Download
            </button>
          </summary>
          <pre className="max-h-[480px] overflow-auto border-t border-slate-800 p-4 font-mono text-xs text-slate-400">
            {JSON.stringify(report, null, 2)}
          </pre>
        </details>
      </section>
    </div>
  );
}
