import type { MetadataRoute } from "next";

import { LOCALES, localePath } from "@/i18n/config";
import { STATIC_PAGES, siteUrl } from "@/lib/site";

/** Every page without parameters in every language. Scan pages are not listed: there is one per repository. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return STATIC_PAGES.flatMap((path) =>
    LOCALES.map((lang) => ({
      url: `${base}${localePath(lang, path)}`,
      alternates: { languages: Object.fromEntries(LOCALES.map((l) => [l, `${base}${localePath(l, path)}`])) },
    })),
  );
}
