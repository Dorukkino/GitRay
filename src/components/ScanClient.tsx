"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { Report } from "@/engine";

import { ReportView } from "./ReportView";

type State =
  | { kind: "loading" }
  | { kind: "error"; code: string; message: string }
  | { kind: "done"; report: Report; receivedAt: number };

const STEPS = [
  "Reading repository metadata from the GitHub API",
  "Streaming the source archive into memory (never to disk)",
  "Running every rule over every file",
  "Adding up the score",
];

const ERROR_HELP: Record<string, string> = {
  not_found: "Check the spelling. Private repositories cannot be scanned.",
  private: "Only public repositories can be scanned.",
  rate_limited: "Too many scans in a short time. Wait a minute and try again.",
  busy: "The scanner is busy. Try again in a few seconds.",
  invalid_target: "Use the form github.com/owner/repository.",
};

function ScanAge({ iso, now }: { iso: string; now: number }) {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  const text = minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
  return <span className="text-slate-200">{text}</span>;
}

export function ScanClient({ owner, repo }: { owner: string; repo: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [step, setStep] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1600);
    const query = `repo=${encodeURIComponent(`${owner}/${repo}`)}${fresh ? "&fresh=1" : ""}`;
    fetch(`/api/scan?${query}`, { signal: controller.signal })
      .then(async (resp) => {
        const body = await resp.json().catch(() => null);
        if (resp.ok && body?.schemaVersion === 1) setState({ kind: "done", report: body as Report, receivedAt: Date.now() });
        else
          setState({
            kind: "error",
            code: body?.error?.code ?? "unexpected",
            message: body?.error?.message ?? `The scan failed (HTTP ${resp.status}).`,
          });
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setState({ kind: "error", code: "network", message: e instanceof Error ? e.message : "Network error" });
      })
      .finally(() => clearInterval(timer));
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [owner, repo, attempt, fresh]);

  function rescan() {
    setState({ kind: "loading" });
    setStep(0);
    setFresh(true);
    setAttempt((a) => a + 1);
  }

  if (state.kind === "done") {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-2 text-sm text-slate-400">
          <span>
            Scanned <ScanAge iso={state.report.startedAt} now={state.receivedAt} />
            {state.report.target && (
              <>
                {" "}
                for commit <code className="font-mono text-slate-300">{state.report.target.headSha.slice(0, 7)}</code>
              </>
            )}
            .
          </span>
          <button
            type="button"
            onClick={rescan}
            className="rounded-md bg-slate-800 px-3 py-1 text-xs text-slate-100 hover:bg-slate-700"
          >
            Scan again now
          </button>
        </div>
        <ReportView report={state.report} />
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-center">
        <h1 className="text-lg font-semibold text-rose-200">Could not scan {owner}/{repo}</h1>
        <p className="mt-2 text-sm text-slate-300">{state.message}</p>
        {ERROR_HELP[state.code] && <p className="mt-1 text-sm text-slate-400">{ERROR_HELP[state.code]}</p>}
        <div className="mt-5 flex justify-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => {
              setState({ kind: "loading" });
              setStep(0);
              setAttempt((a) => a + 1);
            }}
            className="rounded-lg bg-slate-800 px-4 py-2 text-slate-100 hover:bg-slate-700"
          >
            Try again
          </button>
          <Link href="/" className="rounded-lg px-4 py-2 text-slate-400 hover:text-slate-200">
            Scan another repository
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-slate-800 bg-slate-900/40 p-6" aria-live="polite">
      <div className="relative mb-5 h-24 overflow-hidden rounded-xl border border-slate-800 bg-[#05080d]">
        <div className="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-cyan-400/0 via-cyan-400/25 to-cyan-400/0 animate-scanline" />
        <div className="flex h-full flex-col justify-center gap-1.5 px-4 font-mono text-[11px] text-slate-600">
          <span>package.json · setup.py · .vscode/tasks.json · README.md</span>
          <span>*.csproj · build.rs · .github/workflows/*.yml · *.exe</span>
          <span>src/**/*.py · src/**/*.js · scripts/*.sh · *.ps1</span>
        </div>
      </div>
      <h1 className="font-mono text-lg font-semibold break-all text-slate-100">
        Scanning {owner}/{repo}
      </h1>
      <ol className="mt-4 space-y-2 text-sm">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex items-center gap-2 ${i <= step ? "text-slate-200" : "text-slate-600"}`}>
            <span
              className={`h-2 w-2 rounded-full ${i < step ? "bg-emerald-400" : i === step ? "animate-pulse bg-cyan-400" : "bg-slate-700"}`}
            />
            {s}
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-slate-500">Usually 2-20 seconds, depending on the size of the repository.</p>
    </div>
  );
}
