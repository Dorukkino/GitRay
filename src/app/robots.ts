import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site";

/**
 * The API stays out of crawlers' reach, so a crawler rendering a scan page
 * cannot start scans. The admin page is deliberately NOT listed: it is a secret
 * URL, and listing it in robots.txt would disclose the path to everyone. It is
 * instead kept out of search by its own `noindex` and behind authentication.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
