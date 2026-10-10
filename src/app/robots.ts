import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site";

/** The API stays out of crawlers' reach, so a crawler rendering a scan page cannot start scans. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
