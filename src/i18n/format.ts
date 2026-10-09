/** Small helpers for dictionary texts: {name} placeholders and plural forms. */

import { Fragment, type ReactNode, createElement } from "react";

import { INTL_LOCALE, type Locale } from "./config";

export interface PluralText {
  one: string;
  other: string;
}

/** Replaces {name} with vars.name; unknown names stay as they are. */
export function fmt(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

const pluralRules = new Map<Locale, Intl.PluralRules>();

/** The plural form for n, with {n} filled in: plural("en", 2, files) → "2 files". */
export function plural(locale: Locale, n: number, forms: PluralText, vars: Record<string, string | number> = {}): string {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(INTL_LOCALE[locale]);
    pluralRules.set(locale, rules);
  }
  return fmt(rules.select(n) === "one" ? forms.one : forms.other, { n, ...vars });
}

/**
 * Like fmt, but placeholders can be React nodes (a link, a <code>), so word
 * order stays with the translation: rich("{age} tarandı", { age: <b>…</b> }).
 */
export function rich(template: string, nodes: Record<string, ReactNode>): ReactNode {
  const parts = template.split(/(\{\w+\})/);
  return parts.map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    const value = m && m[1] in nodes ? nodes[m[1]] : part;
    return createElement(Fragment, { key: i }, value);
  });
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "3 minutes ago" / "3 dakika önce"; anything under a minute is "now". */
export function relativeTime(locale: Locale, iso: string, now: number): string {
  const rtf = new Intl.RelativeTimeFormat(INTL_LOCALE[locale], { numeric: "auto" });
  const diff = Date.parse(iso) - now;
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return rtf.format(0, "second");
}
