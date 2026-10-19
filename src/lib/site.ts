/** The site's own addresses and settings: its public URL and the pages search engines may list. */

import type { Metadata } from "next";

import { LOCALES, type Locale, localePath } from "@/i18n/config";

export const SITE_NAME = "GiTRay";

/** The production address (gitray.net, live since 19 October 2026). Set SITE_URL to it on the host; www redirects to the apex. */
export const PRODUCTION_URL = "https://gitray.net";

/** Google Analytics 4 property of the site; it loads only after the visitor accepts it (src/components/Analytics.tsx). */
export const GA_MEASUREMENT_ID = "G-NFBDBGY2JH";

/** localStorage key of the visitor's answer to the analytics question. */
export const CONSENT_KEY = "gitray-consent";

/** Only the real site counts visits: previews and local development never ask or load analytics. */
export function analyticsHost(hostname: string): boolean {
  const prod = new URL(PRODUCTION_URL).hostname.replace(/^www\./, "");
  return hostname === prod || hostname === `www.${prod}`;
}

/** localStorage key of the theme choice; public/theme.js reads the same key before the first paint. */
export const THEME_KEY = "gitray-theme";

/** Shown on the privacy and terms pages; change it whenever either text changes. */
export const LEGAL_UPDATED = "2026-10-19";

/** Pages without parameters, as paths inside a locale. Scan pages are not listed. */
export const STATIC_PAGES = ["/", "/how-it-works", "/safe-zone", "/scammer", "/recent", "/rules", "/privacy", "/terms"] as const;
export type StaticPage = (typeof STATIC_PAGES)[number];

function origin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * The public address of the site, without a trailing slash. SITE_URL wins and
 * is set on the host to the production domain; the Vercel fallback remains for
 * older deployments, and localhost is used for development.
 */
export function siteUrl(env: Record<string, string | undefined> = process.env): string {
  return origin(env.SITE_URL) ?? (env.VERCEL ? PRODUCTION_URL : "http://localhost:3000");
}

/** Canonical URL and the same page in every language, for a page's metadata. */
export function pageAlternates(lang: Locale, path: StaticPage): Metadata["alternates"] {
  return {
    canonical: localePath(lang, path),
    // The bare path sends a visitor to their own language (src/proxy.ts).
    languages: { ...Object.fromEntries(LOCALES.map((l) => [l, localePath(l, path)])), "x-default": path },
  };
}
