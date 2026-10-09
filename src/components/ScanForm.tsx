"use client";

import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { InvalidTarget } from "@/engine/errors";
import { parseTarget } from "@/engine/target";
import { scanPath } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";

const EXAMPLES = ["octocat/Hello-World", "nvm-sh/nvm", "pallets/flask"];

export function ScanForm({ autoFocus = false, initial = "" }: { autoFocus?: boolean; initial?: string }) {
  const router = useRouter();
  const { locale, dict } = useI18n();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  function go(raw: string) {
    try {
      const ref = parseTarget(raw);
      setError(null);
      router.push(scanPath(locale, ref.owner, ref.repo));
    } catch (e) {
      setError(e instanceof InvalidTarget ? dict.form.invalid : dict.form.failed);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    go(value);
  }

  return (
    <div className="w-full">
      <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded-2xl border border-line bg-raised/90 p-2 shadow-xl shadow-accent/5 sm:flex-row">
        <label htmlFor="repo" className="sr-only">
          {dict.form.label}
        </label>
        <div className="relative flex-1">
          <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-mono text-sm text-subtle">github.com/</span>
          <input
            id="repo"
            name="repo"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={dict.form.placeholder}
            autoComplete="off"
            spellCheck={false}
            autoFocus={autoFocus}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "repo-error" : undefined}
            className="h-12 w-full rounded-xl border border-transparent bg-sunken/60 pr-3 pl-[6.6rem] font-mono text-sm text-fg outline-none transition placeholder:text-subtle focus:border-accent/50 focus:bg-raised focus:ring-4 focus:ring-accent/15"
          />
        </div>
        <motion.button
          type="submit"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="h-12 rounded-xl bg-gradient-to-r from-accent to-accent-2 px-6 font-semibold text-on-accent shadow-lg shadow-accent/25"
        >
          {dict.form.submit}
        </motion.button>
      </form>
      {error && (
        <motion.p id="repo-error" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-2 text-sm text-dangerous">
          {error}
        </motion.p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-subtle">
        <span>{dict.form.try}</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => {
              setValue(ex);
              go(ex);
            }}
            className="rounded-full border border-line bg-surface/70 px-2.5 py-1 font-mono text-muted transition hover:border-accent/40 hover:text-accent"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
