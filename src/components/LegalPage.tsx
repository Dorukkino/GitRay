import type { ReactNode } from "react";

import { INTL_LOCALE, type Locale } from "@/i18n/config";
import { fmt, rich } from "@/i18n/format";
import { LEGAL_UPDATED } from "@/lib/site";

import { Reveal } from "./motion";

interface LegalText {
  title: string;
  updated: string;
  intro: string;
  sections: { title: string; paragraphs: string[] }[];
}

/** Our own fixed links and code names, filled into the {placeholders} of a legal text. */
export const legalLink = (href: string, label: string) => (
  <a href={href} className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent" rel="noopener noreferrer">
    {label}
  </a>
);

export const legalCode = (text: string) => <code className="rounded bg-sunken px-1.5 py-0.5 font-mono text-[0.85em] text-fg">{text}</code>;

/** The privacy policy and the terms: a title, a date and plain sections. */
export function LegalPage({ text, locale, nodes }: { text: LegalText; locale: Locale; nodes: Record<string, ReactNode> }) {
  const date = new Date(`${LEGAL_UPDATED}T00:00:00Z`).toLocaleDateString(INTL_LOCALE[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="animate-enter text-3xl font-bold tracking-tight text-fg sm:text-4xl">{text.title}</h1>
      <p className="animate-enter mt-2 text-sm text-subtle" style={{ animationDelay: "60ms" }}>
        {fmt(text.updated, { date })}
      </p>
      <p className="animate-enter mt-6 leading-relaxed text-muted" style={{ animationDelay: "120ms" }}>
        {text.intro}
      </p>
      {text.sections.map((s) => (
        <Reveal as="section" key={s.title} className="mt-10">
          <h2 className="text-xl font-semibold tracking-tight text-fg">{s.title}</h2>
          {s.paragraphs.map((p, i) => (
            <p key={i} className="mt-3 leading-relaxed text-muted">
              {rich(p, nodes)}
            </p>
          ))}
        </Reveal>
      ))}
    </article>
  );
}
