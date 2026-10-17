"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";

import type { Category, Report, ReportChainStep, ReportCheckedFile, ReportFinding, ReportSubmodule, Reputation, Severity } from "@/engine";
import { type Locale, INTL_LOCALE, scanPath } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { fmt, plural, rich } from "@/i18n/format";
import { useI18n } from "@/i18n/provider";
import { ruleText } from "@/i18n/rules";

import { Reveal } from "./motion";
import { ReportFalseFinding } from "./ReportFalseFinding";
import { ScoreGauge } from "./ScoreGauge";
import { CATEGORY_ORDER, SEVERITY_STYLE, VERDICT_STYLE, VerdictBadge } from "./verdict";

// Everything shown here comes from the report, where repository-controlled
// strings are already sanitized. React escapes all of it; nothing is rendered
// as HTML and no link points at a URL taken from the repository.

type Check = { text: string; warn: boolean };

/** What the OSV dependency check found. Always says something, so the check is never invisible. */
function dependencyCheckText(report: Report, locale: Locale, dict: Dictionary): Check {
  const t = dict.report.dependency;
  const check = report.dependencyCheck;
  // Reports stored before this check existed have no dependencyCheck.
  if (!check) return { text: t.older, warn: false };
  const packages = plural(locale, check.packages, t.packages);
  switch (check.status) {
    case "ok":
      return { text: fmt(t.ok, { packages }), warn: false };
    case "found":
      return { text: fmt(t.found, { malicious: check.malicious, packages }), warn: true };
    case "unavailable":
      return { text: t.unavailable, warn: true };
    case "none":
      return { text: t.none, warn: false };
    default:
      return { text: report.partial ? t.notCheckedPartial : t.notChecked, warn: report.partial !== null };
  }
}

/** What the VirusTotal lookups found. Always says something, so the check is never invisible. */
function reputationCheckText(report: Report, locale: Locale, dict: Dictionary): Check {
  const t = dict.report.reputation;
  const check = report.reputationCheck;
  // Reports stored before this check existed have no reputationCheck.
  if (!check) return { text: t.older, warn: false };
  const files = check.files;
  const looked = files.filter((f) => f.reputation.status !== "skipped");
  const unknown = looked.filter((f) => f.reputation.status === "unknown").length;
  const flagged = files.filter((f) => f.reputation.status === "found" && f.reputation.stats.malicious > 0).length;
  // Reports from engine 0.6 have no notLookedUp.
  const more = check.notLookedUp ?? 0;
  const tail = [unknown ? plural(locale, unknown, t.unknown) : "", more ? plural(locale, more, t.more) : ""].filter(Boolean);
  const join = (head: string) => [head, ...tail].join(" ");
  switch (check.status) {
    case "found":
      return { text: join(fmt(t.found, { flagged, files: plural(locale, files.length, t.files) })), warn: true };
    case "ok":
      return { text: join(fmt(t.ok, { files: plural(locale, looked.length, t.files) })), warn: false };
    case "partial":
      return { text: join(fmt(t.partial, { looked: looked.length, files: plural(locale, files.length, t.files) })), warn: false };
    case "unavailable":
      return { text: t.unavailable, warn: true };
    case "not_configured":
      return { text: t.notConfigured, warn: false };
    default:
      return { text: t.none, warn: false };
  }
}

function reputationText(r: Reputation, dict: Dictionary): { text: string; tone: "bad" | "ok" | "muted" } {
  const t = dict.report.reputation;
  if (r.status === "found") {
    const s = r.stats;
    const total = s.malicious + s.suspicious + s.harmless + s.undetected;
    return { text: fmt(t.detects, { bad: s.malicious, total }), tone: s.malicious > 0 ? "bad" : "ok" };
  }
  if (r.status === "unknown") return { text: t.unknownFile, tone: "muted" };
  return { text: t.reasons[r.reason], tone: "muted" };
}

/** Each fingerprint looked up, with a link built from the validated SHA-256 only. */
function CheckedFiles({ files }: { files: ReportCheckedFile[] }) {
  const { dict } = useI18n();
  const t = dict.report.reputation;
  return (
    <ul className="mt-3 space-y-1.5 text-xs">
      {files.map((f) => {
        const r = reputationText(f.reputation, dict);
        const tone = { bad: "text-dangerous font-semibold", ok: "text-clean", muted: "text-subtle" }[r.tone];
        return (
          <li key={`${f.source}:${f.sha256}`} className="flex flex-wrap items-baseline gap-x-2 rounded-lg bg-sunken/50 px-3 py-1.5">
            <span className="font-mono break-all text-fg">{f.name}</span>
            <span className="text-subtle">{f.source === "release" ? t.releaseFile : t.inRepository}</span>
            <span className={tone}>{r.text}</span>
            <a
              href={f.virusTotalUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-accent underline decoration-accent/30 underline-offset-2 hover:text-accent-strong"
            >
              {f.reputation.status === "found" ? t.link : t.searchLink}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** What the comparison of GitHub's archive with the commit's file list found. */
function archiveCheckText(report: Report, locale: Locale, dict: Dictionary): Check | null {
  const t = dict.report.archive;
  // Reports stored before this check existed have no archiveCheck.
  const check = report.archiveCheck;
  if (!check) return null;
  switch (check.status) {
    case "ok":
      return { text: t.ok, warn: false };
    case "hidden":
      return { text: plural(locale, check.hidden, t.hidden, { scanned: check.scanned }), warn: check.scanned < check.hidden };
    case "unavailable":
      return { text: t.unavailable, warn: true };
    default:
      return null;
  }
}

function ExtraCheck({ label, check }: { label: string; check: Check }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="flex shrink-0 items-center gap-2 font-medium text-muted sm:w-60">
        <span className={`h-1.5 w-1.5 rounded-full ${check.warn ? "bg-suspicious" : "bg-clean"}`} />
        {label}
      </dt>
      <dd className={check.warn ? "text-suspicious" : "text-subtle"}>{check.text}</dd>
    </div>
  );
}

/** Other repositories that "git clone --recursive" would add. Only validated owner/repo names become links (to our own scan page). */
function Submodules({ list }: { list: ReportSubmodule[] }) {
  const { locale, dict } = useI18n();
  const t = dict.report.submodules;
  return (
    <div className="mt-4 border-t border-line pt-4 text-xs">
      <p className="text-suspicious">
        {plural(locale, list.length, t.count)}{" "}
        {rich(t.text, { command: <code className="font-mono">git clone --recursive</code> })}
      </p>
      <ul className="mt-2 space-y-1">
        {list.map((s, i) => {
          const [owner, repo] = s.github?.split("/") ?? [];
          return (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2 font-mono break-all text-muted">
              <span className="text-fg">{s.path}</span>
              <span>{fmt(t.from, { url: s.url })}</span>
              {owner && repo && (
                <Link
                  href={scanPath(locale, owner, repo)}
                  className="font-sans text-accent underline decoration-accent/30 underline-offset-2 hover:text-accent-strong"
                >
                  {fmt(t.scan, { repo: s.github ?? "" })}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Age at scan time (deterministic, so server and browser render the same text). */
function age(iso: string | null, scannedAt: string, locale: Locale, dict: Dictionary): string {
  const t = dict.report.age;
  if (!iso) return t.unknown;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return t.unknown;
  const days = Math.floor((Date.parse(scannedAt) - then) / 86_400_000);
  if (days < 1) return t.today;
  if (days < 60) return plural(locale, days, t.days);
  if (days < 730) return fmt(t.months, { n: Math.floor(days / 30) });
  return fmt(t.years, { n: Math.floor(days / 365) });
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-raised/70 px-3 py-2">
      <div className="text-[11px] tracking-wide text-subtle uppercase">{label}</div>
      <div className="mt-0.5 truncate font-mono text-sm text-fg" title={value}>
        {value}
      </div>
    </div>
  );
}

function SeverityPill({ severity }: { severity: Severity }) {
  const { dict } = useI18n();
  return (
    <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase ring-1 ${SEVERITY_STYLE[severity]}`}>
      {dict.severity[severity]}
    </span>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-sunken px-2 py-0.5 text-[11px] text-muted">{children}</span>;
}

/** A behavior finding's data-flow chain: each step is a line, linked to GitHub when known. */
function ChainView({ chain }: { chain: ReportChainStep[] }) {
  const { dict } = useI18n();
  const t = dict.report;
  return (
    <ol className="mt-3 space-y-1.5">
      {chain.map((step, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/12 font-mono text-[11px] text-accent ring-1 ring-accent/20">{i + 1}</span>
          <span className="text-muted">
            {t.chainSteps[step.kind] ?? step.kind}
            {" · "}
            {step.githubUrl ? (
              <a href={step.githubUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
                {fmt(t.chainLine, { n: step.line })}
              </a>
            ) : (
              <span className="text-subtle">{fmt(t.chainLine, { n: step.line })}</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A 0-100 scale with the clean/suspicious/dangerous zones and a marker where this repo landed. */
function ScoreScale({ score, color }: { score: number; color: string }) {
  const { dict } = useI18n();
  const t = dict.report.how;
  const at = Math.min(100, Math.max(0, score));
  return (
    <div className="mt-4">
      <div className="relative h-7">
        <div className="absolute inset-x-0 top-3 flex h-2 overflow-hidden rounded-full">
          <div className="bg-clean/35" style={{ width: "30%" }} />
          <div className="bg-suspicious/35" style={{ width: "40%" }} />
          <div className="bg-dangerous/35" style={{ width: "30%" }} />
        </div>
        <motion.div
          className="absolute top-0"
          style={{ left: `${at}%` }}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className="-translate-x-1/2">
            <div className="mx-auto h-3.5 w-3.5 rounded-full border-2 border-bg shadow" style={{ background: color }} />
          </div>
        </motion.div>
      </div>
      <div className="flex justify-between text-[11px] text-subtle">
        <span>0 · {t.zoneClean}</span>
        <span>30 · {t.zoneSuspicious}</span>
        <span>70 · {t.zoneDangerous}</span>
        <span>100</span>
      </div>
      <p className="mt-2 text-sm font-medium text-fg">{fmt(t.thisRepo, { score })}</p>
    </div>
  );
}

/** Plain-language account of what the scan did and how the score was reached. */
function HowScanned({ report, color }: { report: Report; color: string }) {
  const { dict } = useI18n();
  const t = dict.report.how;
  const files = report.stats.textFiles + report.stats.binaryFiles;
  const kb = Math.max(1, Math.round(report.stats.decompressedBytes / 1024));
  const steps = [
    { icon: "M4 7a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z", text: fmt(t.read, { files, kb }) },
    { icon: "M11 4a7 7 0 1 0 4.9 12l4 4M9 11h4m-2-2v4", text: fmt(t.rules, { rules: report.rulesRun }) },
    { icon: "M9 12l2 2 4-4M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z", text: t.checks },
    { icon: "M4 16a8 8 0 1 1 16 0M12 16l4-5", text: t.scored },
  ];
  return (
    <Reveal as="section" className="rounded-2xl border border-line bg-surface/80 p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold text-fg">{t.title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">{t.intro}</p>
      <ol className="mt-4 space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent ring-1 ring-accent/20">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={s.icon} />
              </svg>
            </span>
            <span className="pt-1 text-sm leading-relaxed text-muted">{s.text}</span>
          </li>
        ))}
      </ol>
      <div className="mt-5 border-t border-line/70 pt-4">
        <h3 className="text-sm font-semibold text-fg">{t.scaleTitle}</h3>
        <ScoreScale score={report.score} color={color} />
        <p className="mt-2 text-xs text-subtle">{t.scaleNote}</p>
      </div>
    </Reveal>
  );
}

function FindingCard({ f, notCounted }: { f: ReportFinding; notCounted?: boolean }) {
  const { dict } = useI18n();
  const t = dict.report;
  const text = ruleText(dict, f.ruleId, { title: f.title, why: f.why });
  const where = f.path ? `${f.path}${f.line > 0 ? `:${f.line}` : ""}` : t.metadata;
  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl border border-line bg-surface/90 p-4 shadow-sm transition-colors hover:border-line-strong"
    >
      <div className="flex flex-wrap items-center gap-2">
        <SeverityPill severity={f.severity} />
        <h4 className="font-medium text-fg">{text.title}</h4>
        <span className="font-mono text-xs text-subtle">
          {f.ruleId} · {notCounted ? <span className="text-subtle line-through">+{f.weight}</span> : `+${f.weight}`}
        </span>
        {notCounted && <Tag>{t.notCounted}</Tag>}
        {f.docContext && <Tag>{t.inDocs}</Tag>}
        {f.patternContext && <Tag>{t.inPattern}</Tag>}
        {f.inArchive && <Tag>{t.inZip}</Tag>}
        {f.testContext && <Tag>{t.inTest}</Tag>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-mono break-all text-accent">{where}</span>
        {f.githubUrl && (
          <a
            href={f.githubUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-xs text-muted underline decoration-line-strong underline-offset-2 hover:text-fg"
          >
            {t.viewOnGitHub}
          </a>
        )}
      </div>
      {!f.chain?.length && (f.noteKey || f.note) && (
        <p className="mt-1.5 text-sm text-muted">{f.noteKey ? fmt(t.notes[f.noteKey] ?? f.note ?? "", f.noteArgs ?? {}) : f.note}</p>
      )}
      {f.chain && f.chain.length > 0 && <ChainView chain={f.chain} />}
      {f.snippet && (
        <pre className="film mt-3 overflow-x-auto rounded-xl border border-film-line p-3 font-mono text-[13px] leading-relaxed break-all whitespace-pre-wrap">
          {f.snippet}
        </pre>
      )}
      <details className="group mt-3">
        <summary className="cursor-pointer list-none text-sm text-muted select-none hover:text-fg">
          <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
          {t.whyMatters}
        </summary>
        <p className="mt-2 pl-4 text-sm leading-relaxed text-muted">{text.why}</p>
      </details>
    </motion.article>
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

function FilterChip({
  group,
  active,
  onClick,
  children,
}: {
  group: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`relative rounded-full px-2.5 py-1 ring-1 transition-colors ${
        active ? "text-on-accent ring-accent" : "text-muted ring-line hover:text-fg hover:ring-line-strong"
      }`}
    >
      {active && (
        <motion.span layoutId={`filter-${group}`} className="absolute inset-0 rounded-full bg-accent" transition={{ type: "spring", stiffness: 500, damping: 36 }} />
      )}
      <span className="relative">{children}</span>
    </button>
  );
}

export function ReportView({ report }: { report: Report }) {
  const { locale, dict } = useI18n();
  const t = dict.report;
  const [category, setCategory] = useState<Category | "all">("all");
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [reporting, setReporting] = useState(false);
  const style = VERDICT_STYLE[report.verdict];
  const target = report.target;

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
  const archiveCheck = archiveCheckText(report, locale, dict);
  const dependencyCheck = dependencyCheckText(report, locale, dict);
  const reputationCheck = reputationCheckText(report, locale, dict);
  const scannedAt = new Date(report.startedAt).toLocaleString(INTL_LOCALE[locale], {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
  const line = [
    fmt(t.line.rules, { n: report.rulesRun }),
    fmt(t.line.sizes, { downloaded: formatBytes(report.stats.downloadedBytes), unpacked: formatBytes(report.stats.decompressedBytes) }),
    fmt(t.line.binaries, { n: report.stats.binaryFiles }),
    archiveMembers > 0 ? plural(locale, report.stats.archivesOpened, t.line.zips, { members: archiveMembers }) : "",
    (report.stats.archivesSkipped ?? 0) > 0 ? fmt(t.line.zipsSkipped, { n: report.stats.archivesSkipped ?? 0 }) : "",
    fmt(t.line.seconds, { s: (report.durationMs / 1000).toFixed(1) }),
    fmt(t.line.scannedAt, { date: `${scannedAt} UTC` }),
  ].filter(Boolean);

  return (
    <div className="space-y-8">
      {/* Summary */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className={`relative overflow-hidden rounded-3xl border bg-surface/90 p-5 shadow-xl shadow-accent/5 sm:p-7 ${style.border}`}
      >
        <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full opacity-20 blur-3xl" style={{ background: style.color }} />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center">
          <div className="flex items-center gap-5">
            <ScoreGauge score={report.score} verdict={report.verdict} />
            <div className="md:hidden">
              <VerdictBadge verdict={report.verdict} label={dict.verdicts[report.verdict].label} size="lg" />
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="hidden md:block">
                <VerdictBadge verdict={report.verdict} label={dict.verdicts[report.verdict].label} size="lg" />
              </div>
              {!report.complete && (
                <span className="rounded-full bg-incomplete/12 px-2.5 py-1 text-xs font-medium text-incomplete ring-1 ring-incomplete/30">
                  {t.partialScan}
                </span>
              )}
              {target && (
                <button
                  type="button"
                  onClick={() => setReporting((v) => !v)}
                  aria-expanded={reporting}
                  className="rounded-full border border-line bg-surface/70 px-2.5 py-1 text-xs text-muted transition hover:border-accent/40 hover:text-accent"
                >
                  {t.reportButton}
                </button>
              )}
            </div>
            {target ? (
              <div>
                <h1 className="font-mono text-xl font-semibold break-all text-fg sm:text-2xl">
                  <a href={target.url} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline">
                    {target.fullName}
                  </a>
                </h1>
                {target.description && <p className="mt-1 text-sm text-muted">{target.description}</p>}
              </div>
            ) : (
              <h1 className="text-xl font-semibold text-fg">{t.scanResult}</h1>
            )}
            <p className="max-w-3xl text-sm leading-relaxed text-fg/85">{dict.verdicts[report.verdict].summary}</p>
          </div>
        </div>

        {target && (
          <div className="relative mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label={t.stats.commit} value={target.headSha.slice(0, 12)} />
            <Stat label={t.stats.branch} value={target.defaultBranch} />
            <Stat label={t.stats.repoCreated} value={age(target.createdAt, report.startedAt, locale, dict)} />
            <Stat label={t.stats.ownerSince} value={age(target.owner.createdAt, report.startedAt, locale, dict)} />
            <Stat label={t.stats.starsForks} value={`${target.stars} / ${target.forks}`} />
            <Stat label={t.stats.filesScanned} value={`${filesScanned}`} />
          </div>
        )}
        <p className="relative mt-4 text-xs text-subtle">{line.join(" · ")}</p>
        <dl className="relative mt-4 space-y-2 border-t border-line pt-4 text-xs">
          <ExtraCheck label={t.checks.dependencies} check={dependencyCheck} />
          <ExtraCheck label={t.checks.reputation} check={reputationCheck} />
          {archiveCheck && <ExtraCheck label={t.checks.hidden} check={archiveCheck} />}
        </dl>
        {(report.reputationCheck?.files.length ?? 0) > 0 && <CheckedFiles files={report.reputationCheck.files} />}
        {/* Reports stored before this check existed have no submodules. */}
        {(report.submodules?.length ?? 0) > 0 && <Submodules list={report.submodules} />}
      </motion.section>

      <AnimatePresence>
        {reporting && target && <ReportFalseFinding key="report-form" report={report} onClose={() => setReporting(false)} />}
      </AnimatePresence>

      {report.partial && (
        <Reveal>
          <section className="rounded-2xl border border-incomplete/30 bg-incomplete/8 p-4 text-sm text-fg">
            {rich(t.partialBox, {
              title: <strong className="font-semibold text-incomplete">{t.partialTitle}</strong>,
              limit: t.limits[report.partial.limit] ?? report.partial.limit,
              reason: report.partial.reason,
              files: report.partial.filesScanned,
            })}
          </section>
        </Reveal>
      )}

      {report.testFilesCapped && (
        <Reveal>
          <section className="rounded-2xl border border-suspicious/30 bg-suspicious/8 p-4 text-sm text-fg">
            <strong className="font-semibold text-suspicious">{t.heldTitle}</strong> {t.heldText}
          </section>
        </Reveal>
      )}

      {report.weakSignalsCapped && (
        <Reveal>
          <section className="rounded-2xl border border-suspicious/30 bg-suspicious/8 p-4 text-sm text-fg">
            <strong className="font-semibold text-suspicious">{t.weakHeldTitle}</strong> {t.weakHeldText}
          </section>
        </Reveal>
      )}

      {/* Score breakdown */}
      <Reveal as="section">
        <h2 className="mb-3 text-lg font-semibold text-fg">{t.breakdownTitle}</h2>
        {report.rules.length === 0 ? (
          <p className="rounded-2xl border border-line bg-surface/80 p-4 text-sm text-muted">{t.noRule}</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line bg-surface/80 shadow-sm">
            <table className="w-full text-sm">
              <tbody>
                {report.rules.map((r, i) => {
                  const notCounted = report.testFilesCapped && r.testOnly;
                  return (
                  <tr key={r.id} className={`border-b border-line/70 last:border-0 ${notCounted ? "opacity-60" : ""}`}>
                    <td className="w-16 px-3 py-2.5 text-right font-mono font-semibold text-fg">
                      {notCounted ? <span className="text-subtle line-through">+{r.points}</span> : `+${r.points}`}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-fg">{ruleText(dict, r.id, { title: r.title, why: "" }).title}</div>
                      <div className="font-mono text-xs text-subtle">
                        {r.id} · {dict.categories[r.category].label} · {plural(locale, r.findings, t.findingCount)}
                        {notCounted && <span className="ml-1 text-subtle">· {t.notCounted}</span>}
                      </div>
                    </td>
                    <td className="hidden w-1/3 px-3 py-2.5 sm:table-cell">
                      <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
                        <motion.div
                          className="h-1.5 rounded-full"
                          style={{ background: notCounted ? "var(--subtle)" : style.color }}
                          initial={{ width: 0 }}
                          whileInView={{ width: `${Math.min(100, r.points * 2)}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.8, delay: 0.1 + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-subtle">{t.breakdownNote}</p>
      </Reveal>

      {/* Findings */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-fg">
            {t.findingsTitle} <span className="text-subtle">({report.findings.length + report.omittedFindings})</span>
          </h2>
          {report.findings.length > 0 && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              {(["all", ...categories] as const).map((c) => (
                <FilterChip key={c} group="category" active={category === c} onClick={() => setCategory(c)}>
                  {c === "all" ? t.all : dict.categories[c].label}
                </FilterChip>
              ))}
              <span className="mx-1 w-px bg-line" />
              {(["all", "high", "medium", "low"] as const).map((s) => (
                <FilterChip key={s} group="severity" active={severity === s} onClick={() => setSeverity(s)}>
                  {s === "all" ? t.anySeverity : dict.severity[s][0].toLocaleUpperCase(INTL_LOCALE[locale]) + dict.severity[s].slice(1)}
                </FilterChip>
              ))}
            </div>
          )}
        </div>
        {report.findings.length === 0 ? (
          <p className="rounded-2xl border border-clean/30 bg-clean/8 p-4 text-sm text-fg">{t.nothing}</p>
        ) : (
          <div className="space-y-6">
            <AnimatePresence mode="popLayout" initial={false}>
              {grouped.map(([cat, list]) => (
                <motion.div key={cat} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <h3 className="mb-2 text-sm font-semibold tracking-wide text-subtle uppercase">{dict.categories[cat].label}</h3>
                  <div className="space-y-3">
                    {list.map((f, i) => (
                      <FindingCard key={`${f.ruleId}-${f.path}-${f.line}-${i}`} f={f} notCounted={report.testFilesCapped && f.testContext} />
                    ))}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {shown.length === 0 && <p className="text-sm text-subtle">{t.noMatch}</p>}
            {report.omittedFindings > 0 && <p className="text-sm text-subtle">{fmt(t.omitted, { n: report.omittedFindings })}</p>}
          </div>
        )}
      </section>

      {/* Release assets */}
      {report.releaseAssets.length > 0 && (
        <Reveal as="section">
          <h2 className="mb-1 text-lg font-semibold text-fg">{t.releasesTitle}</h2>
          <p className="mb-3 text-sm text-muted">{t.releasesIntro}</p>
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface/80 shadow-sm">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-sunken/70 text-left text-xs text-subtle uppercase">
                <tr>
                  <th className="px-3 py-2 font-medium">{t.columns.release}</th>
                  <th className="px-3 py-2 font-medium">{t.columns.file}</th>
                  <th className="px-3 py-2 font-medium">{t.columns.size}</th>
                  <th className="px-3 py-2 font-medium">{t.columns.sha256}</th>
                </tr>
              </thead>
              <tbody>
                {report.releaseAssets.map((a, i) => (
                  <tr key={`${a.releaseTag}-${a.name}-${i}`} className="border-t border-line/70">
                    <td className="px-3 py-2 font-mono text-muted">{a.releaseTag}</td>
                    <td className="px-3 py-2 font-mono break-all text-fg">{a.name}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted">{formatBytes(a.size)}</td>
                    <td className="px-3 py-2">
                      {a.sha256 ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="font-mono text-xs text-subtle" title={a.sha256}>
                            {a.sha256.slice(0, 16)}…
                          </code>
                          {a.virusTotalUrl && (
                            <a
                              href={a.virusTotalUrl}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="text-xs text-accent underline decoration-accent/30 underline-offset-2 hover:text-accent-strong"
                            >
                              {t.checkOnVirusTotal}
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-suspicious">{t.noDigest}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      )}

      {/* How the scan worked, in plain language */}
      <HowScanned report={report} color={style.color} />

      {/* Raw JSON */}
      <section>
        <details className="group rounded-2xl border border-line bg-surface/80">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm text-muted select-none">
            <span>
              <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span> {t.rawTitle}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                downloadJson(report);
              }}
              className="rounded-full bg-sunken px-3 py-1 text-xs text-fg transition-colors hover:bg-line"
            >
              {t.download}
            </button>
          </summary>
          <pre className="film max-h-[480px] overflow-auto rounded-b-2xl border-t border-film-line p-4 font-mono text-xs">
            {JSON.stringify(report, null, 2)}
          </pre>
        </details>
      </section>
    </div>
  );
}
