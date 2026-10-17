import type { MetadataRoute } from "next";

import { LOCALES, localePath } from "@/i18n/config";
import { type StaticPage, STATIC_PAGES, siteUrl } from "@/lib/site";

/** How important each page is to crawlers, and how often it changes. */
const PAGE_HINTS: Record<StaticPage, { priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = {
  "/": { priority: 1.0, changeFrequency: "daily" },
  "/how-it-works": { priority: 0.8, changeFrequency: "monthly" },
  "/rules": { priority: 0.8, changeFrequency: "monthly" },
  "/safe-zone": { priority: 0.7, changeFrequency: "daily" },
  "/scammer": { priority: 0.7, changeFrequency: "daily" },
  "/recent": { priority: 0.6, changeFrequency: "daily" },
  "/privacy": { priority: 0.3, changeFrequency: "yearly" },
  "/terms": { priority: 0.3, changeFrequency: "yearly" },
};

/** Every page without parameters in every language. Scan pages are not listed: there is one per repository. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const now = new Date();
  return STATIC_PAGES.flatMap((path) =>
    LOCALES.map((lang) => ({
      url: `${base}${localePath(lang, path)}`,
      lastModified: now,
      changeFrequency: PAGE_HINTS[path].changeFrequency,
      priority: PAGE_HINTS[path].priority,
      alternates: { languages: Object.fromEntries(LOCALES.map((l) => [l, `${base}${localePath(l, path)}`])) },
    })),
  );
}
