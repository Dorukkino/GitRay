import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Lift, Reveal } from "@/components/motion";
import { ScanForm } from "@/components/ScanForm";
import { allRules } from "@/engine";
import { isLocale, localePath } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { fmt } from "@/i18n/format";
import { pageAlternates } from "@/lib/site";

const STEP_ICONS = [
  // Cloud with an arrow: metadata from the API.
  "M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 9.5 4.5 4.5 0 0 1 17.5 18H7zM12 11v6m-3-3 3 3 3-3",
  // Chip: memory.
  "M8 4v2m4-2v2m4-2v2M8 18v2m4-2v2m4-2v2M4 8h2m-2 4h2m-2 4h2m12-8h2m-2 4h2m-2 4h2M7 6h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z",
  // Magnifier over lines: explainable rules.
  "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm5-2 4 4M8 9h6m-6 3h4",
  // Gauge: score and verdict.
  "M4 16a8 8 0 1 1 16 0M12 16l4-5M4 20h16",
];

// A crossed-out circle for "never".
const NEVER_ICON = "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.7 5.7l12.6 12.6";

export async function generateMetadata({ params }: PageProps<"/[lang]/how-it-works">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getDictionary(lang).how;
  return { title: t.metaTitle, description: t.metaDescription, alternates: pageAlternates(lang, "/how-it-works") };
}

export default async function HowItWorksPage({ params }: PageProps<"/[lang]/how-it-works">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = getDictionary(lang);
  const t = dict.how;
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="max-w-3xl">
        <h1 className="animate-enter text-3xl font-bold tracking-tight text-fg sm:text-4xl">{t.title}</h1>
        <p className="animate-enter mt-4 text-base leading-relaxed text-muted sm:text-lg" style={{ animationDelay: "80ms" }}>
          {t.intro}
        </p>
      </div>

      <ol className="mt-10 grid gap-4 md:grid-cols-2">
        {t.steps.map((s, i) => (
          <li key={s.title} className="animate-enter" style={{ animationDelay: `${160 + i * 70}ms` }}>
            <Lift className="h-full rounded-2xl border border-line bg-surface p-6 shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/12 text-accent ring-1 ring-accent/20">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={STEP_ICONS[i] ?? STEP_ICONS[0]} />
                </svg>
              </div>
              <h2 className="mt-4 font-semibold text-fg">
                <span className="mr-2 font-mono text-sm text-subtle">0{i + 1}</span>
                {s.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
            </Lift>
          </li>
        ))}
      </ol>

      <section className="mt-16">
        <Reveal>
          <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{t.neverTitle}</h2>
        </Reveal>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {t.never.map((n, i) => (
            <Reveal as="li" key={n.title} delay={(i % 2) * 0.06} className="flex gap-4 rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <svg viewBox="0 0 24 24" width="22" height="22" className="mt-0.5 shrink-0 text-clean" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d={NEVER_ICON} />
              </svg>
              <div>
                <h3 className="font-semibold text-fg">{n.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{n.text}</p>
              </div>
            </Reveal>
          ))}
        </ul>
      </section>

      <section className="mt-16">
        <Reveal>
          <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{t.limitsTitle}</h2>
        </Reveal>
        <Reveal delay={0.05}>
          <ul className="mt-6 max-w-3xl list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted marker:text-subtle sm:text-base">
            {t.limits.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Reveal>
      </section>

      <Reveal className="mt-16 rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
        <h2 className="text-xl font-semibold tracking-tight text-fg">{t.ctaTitle}</h2>
        <div className="mt-5 max-w-xl">
          <ScanForm />
        </div>
        <Link href={localePath(lang, "/rules")} className="group mt-5 inline-block text-sm font-medium text-accent hover:text-accent-strong">
          {fmt(t.ctaRules, { n: allRules().length })} <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
        </Link>
      </Reveal>
    </div>
  );
}
