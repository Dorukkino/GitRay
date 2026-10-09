"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { InvalidTarget } from "@/engine/errors";
import { parseTarget } from "@/engine/target";

const EXAMPLES = ["octocat/Hello-World", "nvm-sh/nvm", "pallets/flask"];

export function ScanForm({ autoFocus = false, initial = "" }: { autoFocus?: boolean; initial?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  function go(raw: string) {
    try {
      const ref = parseTarget(raw);
      setError(null);
      router.push(`/scan/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`);
    } catch (e) {
      setError(e instanceof InvalidTarget ? "Enter a public GitHub repository, e.g. github.com/owner/repo" : "Something went wrong");
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    go(value);
  }

  return (
    <div className="w-full">
      <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="repo" className="sr-only">
          GitHub repository
        </label>
        <div className="relative flex-1">
          <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-mono text-sm text-slate-500">
            github.com/
          </span>
          <input
            id="repo"
            name="repo"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="owner/repository"
            autoComplete="off"
            spellCheck={false}
            autoFocus={autoFocus}
            className="h-12 w-full rounded-xl border border-slate-700 bg-slate-900/70 pr-3 pl-[6.6rem] font-mono text-sm text-slate-100 shadow-inner outline-none placeholder:text-slate-600 focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20"
          />
        </div>
        <button
          type="submit"
          className="h-12 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 px-6 font-semibold text-slate-950 shadow-lg shadow-cyan-500/10 transition hover:brightness-110 active:brightness-95"
        >
          Scan repository
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>Try:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => {
              setValue(ex);
              go(ex);
            }}
            className="rounded-full border border-slate-800 px-2.5 py-1 font-mono text-slate-400 transition hover:border-slate-600 hover:text-slate-200"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
