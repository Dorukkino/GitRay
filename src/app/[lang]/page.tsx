import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { HeroScan } from "@/components/HeroScan";
import { CountUp, Lift, Reveal, ScrollReveal } from "@/components/motion";
import { ScanForm } from "@/components/ScanForm";
import { CATEGORY_ORDER, VERDICT_STYLE } from "@/components/verdict";
import { allRules } from "@/engine";
import type { Category, Verdict } from "@/engine";
import { isLocale, localePath, scanPath } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { fmt, plural, relativeTime } from "@/i18n/format";
import { loadRecent, loadWeeklyCount } from "@/lib/lists";
import { pageAlternates } from "@/lib/site";

const VERDICTS: Verdict[] = ["clean", "suspicious", "dangerous", "incomplete"];

// Rebuilt at most once a minute for the weekly count, like the list pages.
export const revalidate = 60;

export async function generateMetadata({ params }: PageProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { alternates: pageAlternates(lang, "/") } : {};
}

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = getDictionary(lang);
  const h = dict.home;
  const rules = allRules();
  // Both are hidden without a database or when the query fails.
  const [weekly, recent] = await Promise.all([loadWeeklyCount(), loadRecent()]);
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
          <div className="animate-enter" style={{ animationDelay: "380ms" }}>
            <p className="flex items-start gap-2.5 rounded-2xl border border-suspicious/30 bg-suspicious/10 px-4 py-3 text-sm leading-relaxed text-muted">
              <svg viewBox="0 0 24 24" width="18" height="18" className="mt-0.5 shrink-0 text-suspicious" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
              </svg>
              <span>{h.beta}</span>
            </p>
            <div className="mt-4 hidden sm:block">
              <HeroScan />
            </div>
          </div>
        </div>
      </section>

      {recent && recent.items.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-6">
          <Reveal className="flex items-end justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{h.recentTitle}</h2>
            <Link href={localePath(lang, "/recent")} className="group text-sm font-medium text-accent hover:text-accent-strong">
              {h.recentAll} <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </Reveal>
          {/* Each row comes in with the scroll like the cards below. Names come from our own sanitized reports; React escapes them. */}
          <ul className="mt-6 space-y-2">
            {recent.items.map((s) => {
              const [owner, repo] = s.fullName.split("/");
              return (
                <li key={s.fullName} className="lift-host">
                  <ScrollReveal>
                    <Link
                      href={scanPath(lang, owner, repo)}
                      className="lift lift-sm group flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-sm hover:bg-raised sm:px-5"
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: VERDICT_STYLE[s.verdict].color }} />
                      <span className={`hidden w-24 shrink-0 text-sm font-medium sm:block ${VERDICT_STYLE[s.verdict].text}`}>
                        {dict.verdicts[s.verdict].label}
                      </span>
                      <span className="sr-only sm:hidden">{dict.verdicts[s.verdict].label}:</span>
                      <span className="min-w-0 flex-1 truncate font-mono text-sm text-fg group-hover:text-accent">{s.fullName}</span>
                      <span className="hidden shrink-0 font-mono text-xs text-subtle sm:inline">{fmt(dict.lists.score, { n: s.score })}</span>
                      <span className="w-24 shrink-0 text-right text-xs text-subtle">{relativeTime(lang, s.scannedAt, recent.at)}</span>
                    </Link>
                  </ScrollReveal>
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
              <Lift className="h-full rounded-2xl border border-line bg-surface p-5 shadow-sm hover:bg-raised">
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
              <Lift
                className={`h-full rounded-2xl border p-5 ${VERDICT_STYLE[v].border} ${VERDICT_STYLE[v].bg}`}
                style={{ "--lift-ring": VERDICT_STYLE[v].color } as CSSProperties}
              >
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
