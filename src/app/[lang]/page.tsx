import { notFound } from "next/navigation";
import Link from "next/link";

import { HeroScan } from "@/components/HeroScan";
import { CountUp, Lift, Reveal, ScrollReveal } from "@/components/motion";
import { ScanForm } from "@/components/ScanForm";
import { CATEGORY_ORDER, VERDICT_STYLE } from "@/components/verdict";
import { allRules } from "@/engine";
import type { Category, Verdict } from "@/engine";
import { isLocale, localePath } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { fmt, plural } from "@/i18n/format";
import { loadWeeklyCount } from "@/lib/lists";

const VERDICTS: Verdict[] = ["clean", "suspicious", "dangerous", "incomplete"];

const STEP_ICONS = [
  // Cloud with an arrow: metadata from the API.
  "M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 9.5 4.5 4.5 0 0 1 17.5 18H7zM12 11v6m-3-3 3 3 3-3",
  // Chip: memory.
  "M8 4v2m4-2v2m4-2v2M8 18v2m4-2v2m4-2v2M4 8h2m-2 4h2m-2 4h2m12-8h2m-2 4h2m-2 4h2M7 6h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z",
  // Magnifier over lines: explainable rules.
  "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm5-2 4 4M8 9h6m-6 3h4",
];

// Rebuilt at most once a minute for the weekly count, like the list pages.
export const revalidate = 60;

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = getDictionary(lang);
  const h = dict.home;
  const rules = allRules();
  // Hidden without a database or when the query fails.
  const weekly = await loadWeeklyCount();
  const counts = new Map<Category, number>();
  for (const r of rules) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);

  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="bg-grid absolute inset-0" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-16 sm:pt-20 lg:grid-cols-[1.15fr_1fr]">
          <div>
            {weekly !== null && (
              <div className="animate-enter mb-5">
                <div className="inline-flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-2.5 shadow-sm">
                  <CountUp value={weekly} className="font-mono text-2xl font-bold text-gradient tabular-nums" />
                  <span className="text-sm leading-tight text-muted">{plural(lang, weekly, h.weekly)}</span>
                </div>
              </div>
            )}
            <p
              className="animate-enter inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1 text-xs text-muted shadow-sm"
              style={{ animationDelay: "60ms" }}
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-clean opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-clean" />
              </span>
              {fmt(h.badge, { rules: rules.length })}
            </p>
            <h1
              className="animate-enter mt-5 text-4xl leading-[1.08] font-bold tracking-tight text-fg sm:text-5xl lg:text-6xl"
              style={{ animationDelay: "140ms" }}
            >
              {h.titleBefore}
              <span className="text-gradient">{h.titleHighlight}</span>
              {h.titleAfter}
            </h1>
            <p className="animate-enter mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg" style={{ animationDelay: "220ms" }}>
              {h.intro}
            </p>
            <div className="animate-enter mt-8 max-w-xl" style={{ animationDelay: "300ms" }}>
              <ScanForm autoFocus />
            </div>
          </div>
          <div className="animate-enter hidden sm:block" style={{ animationDelay: "380ms" }}>
            <HeroScan />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <Reveal>
          <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{h.howTitle}</h2>
        </Reveal>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {h.steps.map((s, i) => (
            <ScrollReveal key={s.title} column={i}>
              <Lift className="h-full rounded-2xl border border-line bg-surface p-6 shadow-sm">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/12 text-accent ring-1 ring-accent/20">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={STEP_ICONS[i] ?? STEP_ICONS[0]} />
                  </svg>
                </div>
                <h3 className="mt-4 font-semibold text-fg">
                  <span className="mr-2 font-mono text-sm text-subtle">0{i + 1}</span>
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
              </Lift>
            </ScrollReveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <Reveal className="flex items-end justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{h.looksTitle}</h2>
          <Link href={localePath(lang, "/rules")} className="group text-sm font-medium text-accent hover:text-accent-strong">
            {fmt(h.allRules, { n: rules.length })} <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
          </Link>
        </Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORY_ORDER.map((c, i) => (
            <ScrollReveal key={c} column={i % 3}>
              <Lift className="h-full rounded-2xl border border-line bg-surface p-5 shadow-sm transition-colors hover:border-accent/40">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-fg">{dict.categories[c].label}</h3>
                  <span className="rounded-full bg-sunken px-2 py-0.5 font-mono text-xs text-muted">{counts.get(c) ?? 0}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted">{dict.categories[c].text}</p>
              </Lift>
            </ScrollReveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <Reveal>
          <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{h.verdictsTitle}</h2>
        </Reveal>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {VERDICTS.map((v, i) => (
            <ScrollReveal key={v} column={i}>
              <Lift className={`h-full rounded-2xl border p-5 ${VERDICT_STYLE[v].border} ${VERDICT_STYLE[v].bg}`}>
                <div className={`flex items-center gap-2 font-semibold ${VERDICT_STYLE[v].text}`}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: VERDICT_STYLE[v].color }} />
                  {dict.verdicts[v].label}
                </div>
                <div className="mt-1 font-mono text-xs text-subtle">{h.ranges[v]}</div>
                <p className="mt-3 text-sm leading-relaxed text-muted">{dict.verdicts[v].summary}</p>
              </Lift>
            </ScrollReveal>
          ))}
        </div>
        <Reveal>
          <p className="mt-8 max-w-3xl text-sm leading-relaxed text-subtle">{h.disclaimer}</p>
        </Reveal>
      </section>
    </div>
  );
}
