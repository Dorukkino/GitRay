import type { Metadata } from "next";

import { CATEGORY_LABEL, CATEGORY_ORDER } from "@/components/verdict";
import { DANGEROUS_AT, SUSPICIOUS_AT, allRules, severityOf } from "@/engine";

export const metadata: Metadata = {
  title: "Rules",
  description: "Every rule GitRay runs, what it looks for and how much it weighs.",
};

const SEVERITY_TEXT = { high: "text-rose-300", medium: "text-amber-300", low: "text-slate-400" } as const;

export default function RulesPage() {
  const rules = allRules();
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-bold text-slate-50">Rules</h1>
      <p className="mt-3 max-w-3xl text-slate-400">
        GitRay runs {rules.length} rules over every file of the repository. A rule adds its weight to the score once,
        using its strongest finding. The total is capped at 100: below {SUSPICIOUS_AT} is clean, from {SUSPICIOUS_AT}{" "}
        suspicious, from {DANGEROUS_AT} dangerous. Some rules raise their weight for stronger evidence (for example an
        install script that also downloads something). Code rules weigh less inside documentation, where commands are
        usually examples.
      </p>

      <div className="mt-10 space-y-10">
        {CATEGORY_ORDER.map((cat) => {
          const list = rules.filter((r) => r.category === cat);
          if (list.length === 0) return null;
          return (
            <section key={cat}>
              <h2 className="mb-3 text-lg font-semibold text-slate-100">{CATEGORY_LABEL[cat]}</h2>
              <div className="space-y-3">
                {list.map((r) => (
                  <article key={r.id} className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-mono text-xs text-slate-500">{r.id}</span>
                      <h3 className="font-medium text-slate-100">{r.title}</h3>
                      <span className={`font-mono text-xs ${SEVERITY_TEXT[severityOf(r.weight)]}`}>+{r.weight}</span>
                      {r.docWeight !== undefined && (
                        <span className="text-xs text-slate-500">
                          {r.docWeight === 0 ? "ignored in docs" : `+${r.docWeight} in docs`}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">{r.why}</p>
                    {r.appliesTo && (
                      <p className="mt-2 font-mono text-xs text-slate-500">files: {r.appliesTo.join(", ")}</p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
