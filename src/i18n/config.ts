/**
 * Languages of the site. Every page lives under /<locale>/...; src/proxy.ts sends
 * paths without a locale to the visitor's language (cookie first, then the
 * browser's Accept-Language), English when nothing matches.
 *
 * Adding a language: add it to LOCALES and LOCALE_NAMES, write its dictionary
 * (typed as Dictionary, so a missing text fails the type check) and register it
 * in dictionaries/index.ts.
 */

export const LOCALES = ["en", "tr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Set by the language switcher; wins over Accept-Language. */
export const LOCALE_COOKIE = "gitray-lang";

/** Each language's name in its own language, for the switcher. */
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", tr: "Türkçe" };

/** Tags for Intl formatting (dates, plurals). */
export const INTL_LOCALE: Record<Locale, string> = { en: "en-GB", tr: "tr-TR" };

export function isLocale(value: string | null | undefined): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * The best supported language for an Accept-Language header such as
 * "tr-TR,tr;q=0.9,en;q=0.8". Only the primary subtag counts. Returns null
 * when nothing matches.
 */
export function negotiateLocale(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const ranked = header
    .slice(0, 1000)
    .split(",")
    .slice(0, 30)
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      let q = 1;
      for (const p of params) {
        const m = /^\s*q\s*=\s*([01](?:\.\d{0,3})?)\s*$/.exec(p);
        if (m) q = Number(m[1]);
      }
      return { lang: tag.trim().toLowerCase().split("-")[0], q, index };
    })
    .filter((r) => r.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const r of ranked) if (isLocale(r.lang)) return r.lang;
  return null;
}

export function pickLocale(cookie: string | null | undefined, acceptLanguage: string | null | undefined): Locale {
  if (isLocale(cookie)) return cookie;
  return negotiateLocale(acceptLanguage) ?? DEFAULT_LOCALE;
}

/** The locale a path starts with, if any: "/tr/rules" → "tr". */
export function localeOf(pathname: string): Locale | null {
  const first = pathname.split("/")[1] ?? "";
  return isLocale(first) ? first : null;
}

/** The same page in another language: "/tr/rules" → "/en/rules". */
export function switchLocalePath(pathname: string, locale: Locale): string {
  const current = localeOf(pathname);
  const rest = current ? pathname.slice(current.length + 1) : pathname;
  return `/${locale}${rest === "/" ? "" : rest}`;
}

/** A path inside the site for a locale: localePath("tr", "/rules") → "/tr/rules". */
export function localePath(locale: Locale, path = "/"): string {
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/** Our own scan page for a validated owner/repo; segments are encoded. */
export function scanPath(locale: Locale, owner: string, repo: string): string {
  return `/${locale}/scan/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}
