/** The site's own addresses: public URL, metadata alternates, sitemap and robots.txt. */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import robots from "../src/app/robots";
import sitemap from "../src/app/sitemap";
import { LOCALES } from "../src/i18n/config";
import { loadRecent } from "../src/lib/lists";
import { STATIC_PAGES, THEME_KEY, analyticsHost, pageAlternates, siteUrl } from "../src/lib/site";
import { config } from "../src/proxy";

describe("siteUrl", () => {
  it("prefers SITE_URL, then www.gitray.com.tr on Vercel, then localhost", () => {
    expect(siteUrl({ SITE_URL: "https://gitray.example/", VERCEL: "1" })).toBe("https://gitray.example");
    expect(siteUrl({ VERCEL: "1" })).toBe("https://www.gitray.com.tr");
    expect(siteUrl({})).toBe("http://localhost:3000");
  });

  it("ignores values that are not http(s) addresses", () => {
    expect(siteUrl({ SITE_URL: "javascript:alert(1)" })).toBe("http://localhost:3000");
    expect(siteUrl({ SITE_URL: "ftp://gitray.example", VERCEL: "1" })).toBe("https://www.gitray.com.tr");
    expect(siteUrl({ SITE_URL: "not a url" })).toBe("http://localhost:3000");
  });
});

describe("analytics", () => {
  it("runs only on the production domain", () => {
    expect(analyticsHost("www.gitray.com.tr")).toBe(true);
    expect(analyticsHost("gitray.com.tr")).toBe(true);
    for (const host of ["localhost", "gitray.vercel.app", "gitray-git-branch.vercel.app", "evil-gitray.com.tr", "www.gitray.com.tr.evil.example"]) {
      expect(analyticsHost(host), host).toBe(false);
    }
  });
});

describe("page metadata", () => {
  it("gives each page its canonical path and every language", () => {
    expect(pageAlternates("tr", "/privacy")).toEqual({
      canonical: "/tr/privacy",
      languages: { en: "/en/privacy", tr: "/tr/privacy", "x-default": "/privacy" },
    });
    expect(pageAlternates("en", "/")).toEqual({
      canonical: "/en",
      languages: { en: "/en", tr: "/tr", "x-default": "/" },
    });
  });
});

describe("sitemap and robots", () => {
  it("lists every static page in every language with absolute URLs", () => {
    const entries = sitemap();
    expect(entries).toHaveLength(STATIC_PAGES.length * LOCALES.length);
    const urls = entries.map((e) => e.url);
    expect(urls).toContain("http://localhost:3000/tr/how-it-works");
    expect(urls).toContain("http://localhost:3000/en");
    expect(urls.some((u) => u.includes("/scan/"))).toBe(false);
    for (const e of entries) expect(e.alternates?.languages).toMatchObject({ en: expect.stringMatching(/^http/) });
  });

  it("keeps crawlers out of the API and points to the sitemap", () => {
    const r = robots();
    expect(r.rules).toMatchObject({ userAgent: "*", disallow: "/api/" });
    expect(r.sitemap).toBe("http://localhost:3000/sitemap.xml");
  });
});

describe("proxy matcher", () => {
  const matcher = new RegExp(`^${config.matcher[0]}$`);

  it("leaves files served at the root alone", () => {
    for (const path of ["/robots.txt", "/sitemap.xml", "/api/scan", "/icon.svg"]) {
      expect(matcher.test(path), path).toBe(false);
    }
  });

  it("still sends pages without a language through the proxy", () => {
    for (const path of ["/", "/privacy", "/how-it-works", "/scan/a/b"]) expect(matcher.test(path), path).toBe(true);
  });
});

describe("home page recent list", () => {
  it("is hidden without a database", async () => {
    expect(await loadRecent()).toBeNull();
  });
});

it("public/theme.js reads the same theme key as the switcher", () => {
  expect(readFileSync("public/theme.js", "utf8")).toContain(`"${THEME_KEY}"`);
});
