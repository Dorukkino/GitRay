/** The site's own addresses and settings: its public URL and the pages search engines may list. */

import type { Metadata } from "next";

import { LOCALES, type Locale, localePath } from "@/i18n/config";

export const SITE_NAME = "GiTRay";

/** localStorage key of the theme choice; public/theme.js reads the same key before the first paint. */
export const THEME_KEY = "gitray-theme";

/** Shown on the privacy and terms pages; change it whenever either text changes. */
export const LEGAL_UPDATED = "2026-10-10";

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
 * The public address of the site, without a trailing slash. SITE_URL wins;
 * otherwise Vercel's production domain (it becomes the custom domain once one is
 * set as production), and localhost for development.
 */
export function siteUrl(env: Record<string, string | undefined> = process.env): string {
  return origin(env.SITE_URL) ?? origin(env.VERCEL_PROJECT_PRODUCTION_URL) ?? "http://localhost:3000";
}

/** Canonical URL and the same page in every language, for a page's metadata. */
export function pageAlternates(lang: Locale, path: StaticPage): Metadata["alternates"] {
  return {
    canonical: localePath(lang, path),
    // The bare path sends a visitor to their own language (src/proxy.ts).
    languages: { ...Object.fromEntries(LOCALES.map((l) => [l, localePath(l, path)])), "x-default": path },
  };
}
