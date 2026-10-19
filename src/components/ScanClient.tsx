"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { Report } from "@/engine";
import { localePath } from "@/i18n/config";
import { fmt, rich } from "@/i18n/format";
import { useI18n } from "@/i18n/provider";

import { ReportView } from "./ReportView";

type State =
  | { kind: "loading" }
  | { kind: "error"; code: string; message: string }
  | { kind: "done"; report: Report; receivedAt: number };

function ScanAge({ iso, now }: { iso: string; now: number }) {
  const { dict } = useI18n();
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  const text =
    minutes < 1
      ? dict.scan.justNow
      : minutes < 60
        ? fmt(dict.scan.minutesAgo, { n: minutes })
        : fmt(dict.scan.hoursAgo, { n: Math.round(minutes / 60) });
  return <span className="font-medium text-fg">{text}</span>;
}

/** After this many seconds, reassure that a long scan (a big repo) is normal, not stuck. */
const LONG_SCAN_AFTER_SECONDS = 20;

function Loading({ owner, repo, step }: { owner: string; repo: string; step: number }) {
  const { dict } = useI18n();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="mx-auto max-w-xl rounded-2xl border border-line bg-surface/90 p-6 shadow-xl shadow-accent/5"
      aria-live="polite"
    >
      <div className="film relative mb-6 h-28 overflow-hidden rounded-xl border border-film-line">
        <div className="absolute inset-x-0 top-0 h-10 animate-scanline bg-gradient-to-b from-transparent via-[#3d9bff]/30 to-transparent" />
        <div className="flex h-full flex-col justify-center gap-1.5 px-4 font-mono text-[11px] text-film-fg/45">
          <span>package.json · setup.py · .vscode/tasks.json · README.md</span>
          <span>*.csproj · build.rs · .github/workflows/*.yml · *.exe</span>
          <span>src/**/*.py · src/**/*.js · scripts/*.sh · *.ps1</span>
        </div>
      </div>
      <h1 className="font-mono text-lg font-semibold break-all text-fg">{fmt(dict.scan.scanning, { repo: `${owner}/${repo}` })}</h1>
      <ol className="mt-4 space-y-2.5 text-sm">
        {dict.scan.steps.map((s, i) => (
          <motion.li
            key={s}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            className={`flex items-center gap-2.5 transition-colors ${i <= step ? "text-fg" : "text-subtle"}`}
          >
            <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
              {i < step ? (
                <motion.svg
                  viewBox="0 0 20 20"
                  className="h-5 w-5 text-clean"
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 24 }}
                  aria-hidden="true"
                >
                  <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.15" />
                  <path d="M6 10.5l2.5 2.5L14 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </motion.svg>
              ) : i === step ? (
                <span className="h-2.5 w-2.5 animate-ping rounded-full bg-accent" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-line-strong" />
              )}
            </span>
            {s}
          </motion.li>
        ))}
      </ol>
      <p className="mt-5 text-xs text-subtle" aria-live="polite">
        {elapsed >= LONG_SCAN_AFTER_SECONDS ? dict.scan.durationLong : dict.scan.duration}
        {elapsed >= 1 && <span className="text-subtle/70"> · {fmt(dict.scan.elapsed, { s: elapsed })}</span>}
      </p>
    </motion.div>
  );
}

export function ScanClient({ owner, repo }: { owner: string; repo: string }) {
  const { locale, dict } = useI18n();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [step, setStep] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [fresh, setFresh] = useState(false);
  const stepCount = dict.scan.steps.length;

  useEffect(() => {
    const controller = new AbortController();
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, stepCount - 1)), 1600);
    const query = `repo=${encodeURIComponent(`${owner}/${repo}`)}${fresh ? "&fresh=1" : ""}`;
    fetch(`/api/scan?${query}`, { signal: controller.signal })
      .then(async (resp) => {
        const body = await resp.json().catch(() => null);
        if (resp.ok && body?.schemaVersion === 1) setState({ kind: "done", report: body as Report, receivedAt: Date.now() });
        else
          setState({
            kind: "error",
            code: body?.error?.code ?? "unexpected",
            message: body?.error?.message ?? fmt(dict.scan.httpFailed, { status: resp.status }),
          });
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setState({ kind: "error", code: "network", message: e instanceof Error ? e.message : dict.scan.network });
      })
      .finally(() => clearInterval(timer));
    return () => {
      controller.abort();
      clearInterval(timer);
    };
    // The texts only shape error messages; a language switch does not need a new scan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, repo, attempt, fresh, stepCount]);

  function restart(freshScan: boolean) {
    setState({ kind: "loading" });
    setStep(0);
    if (freshScan) setFresh(true);
    setAttempt((a) => a + 1);
  }

  let content;
  if (state.kind === "done") {
    const sha = state.report.target?.headSha.slice(0, 7);
    const age = <ScanAge iso={state.report.startedAt} now={state.receivedAt} />;
    content = (
      <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface/80 px-4 py-2.5 text-sm text-muted shadow-sm">
          <span>
            {sha
              ? rich(dict.scan.scannedWithCommit, { age, sha: <code className="font-mono text-fg">{sha}</code> })
              : rich(dict.scan.scanned, { age })}
          </span>
          <motion.button
            type="button"
            onClick={() => restart(true)}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            className="rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-on-accent shadow-sm"
          >
            {dict.scan.again}
          </motion.button>
        </div>
        <ReportView report={state.report} />
      </motion.div>
    );
  } else if (state.kind === "error") {
    const translated = dict.scan.errorMessages[state.code];
    const help = dict.scan.errorHelp[state.code];
    content = (
      <motion.div
        key="error"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mx-auto max-w-xl rounded-2xl border border-dangerous/30 bg-dangerous/5 p-6 text-center shadow-sm"
      >
        <h1 className="text-lg font-semibold break-all text-dangerous">{fmt(dict.scan.couldNot, { repo: `${owner}/${repo}` })}</h1>
        <p className="mt-2 text-sm text-fg">{translated ?? state.message}</p>
        {help && <p className="mt-1 text-sm text-muted">{help}</p>}
        {translated && state.message !== translated && (
          <p className="mt-2 font-mono text-xs break-all text-subtle">{fmt(dict.scan.details, { text: state.message })}</p>
        )}
        <div className="mt-5 flex justify-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => restart(false)}
            className="rounded-full bg-accent px-4 py-2 font-semibold text-on-accent shadow-sm transition hover:brightness-110"
          >
            {dict.scan.tryAgain}
          </button>
          <Link href={localePath(locale)} className="rounded-full px-4 py-2 text-muted transition-colors hover:text-fg">
            {dict.scan.another}
          </Link>
        </div>
      </motion.div>
    );
  } else {
    content = <Loading key="loading" owner={owner} repo={repo} step={step} />;
  }

  return <AnimatePresence mode="wait">{content}</AnimatePresence>;
}
