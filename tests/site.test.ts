/** The site's own addresses: public URL, metadata alternates, sitemap, robots.txt and security.txt. */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import robots from "../src/app/robots";
import sitemap from "../src/app/sitemap";
import { LOCALES } from "../src/i18n/config";
import { loadRecent } from "../src/lib/lists";
import { securityTxt } from "../src/lib/security-txt";
import { STATIC_PAGES, THEME_KEY, contactEmail, pageAlternates, siteUrl } from "../src/lib/site";
import { canFill } from "../src/components/LegalPage";
import { config } from "../src/proxy";

describe("siteUrl", () => {
  it("prefers SITE_URL, then Vercel's production domain, then localhost", () => {
    expect(siteUrl({ SITE_URL: "https://gitray.example/", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" })).toBe(
      "https://gitray.example",
    );
    expect(siteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "gitray.vercel.app" })).toBe("https://gitray.vercel.app");
    expect(siteUrl({})).toBe("http://localhost:3000");
  });

  it("ignores values that are not http(s) addresses", () => {
    expect(siteUrl({ SITE_URL: "javascript:alert(1)" })).toBe("http://localhost:3000");
    expect(siteUrl({ SITE_URL: "ftp://gitray.example", VERCEL_PROJECT_PRODUCTION_URL: "a.vercel.app" })).toBe(
      "https://a.vercel.app",
    );
    expect(siteUrl({ SITE_URL: "not a url" })).toBe("http://localhost:3000");
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

describe("contact address", () => {
  it("accepts a plain address and nothing else", () => {
    expect(contactEmail({ CONTACT_EMAIL: " hello@gitray.example " })).toBe("hello@gitray.example");
    expect(contactEmail({})).toBeNull();
    expect(contactEmail({ CONTACT_EMAIL: "not an address" })).toBeNull();
    expect(contactEmail({ CONTACT_EMAIL: "a@b" })).toBeNull();
    expect(contactEmail({ CONTACT_EMAIL: 'x"><script>@evil.example' })).toBeNull();
    expect(contactEmail({ CONTACT_EMAIL: `${"a".repeat(250)}@b.co` })).toBeNull();
  });

  it("leaves out legal lines whose placeholders have nothing to show", () => {
    expect(canFill("Write to {contact}.", { contact: null })).toBe(false);
    expect(canFill("Write to {contact}.", { contact: "x" })).toBe(true);
    expect(canFill("No placeholders.", {})).toBe(true);
  });
});

describe("security.txt", () => {
  it("has a mailto contact and an expiry less than a year ahead", () => {
    const now = Date.parse("2026-10-10T00:00:00Z");
    const text = securityTxt("hello@gitray.example", now, "https://gitray.example") ?? "";
    expect(text).toContain("Contact: mailto:hello@gitray.example");
    expect(text).toContain("Canonical: https://gitray.example/.well-known/security.txt");
    expect(text).not.toContain("github.com");
    const expires = Date.parse(/^Expires: (.+)$/m.exec(text)?.[1] ?? "");
    expect(expires).toBeGreaterThan(now);
    expect(expires - now).toBeLessThan(365 * 24 * 60 * 60 * 1000);
  });

  it("is not served without a contact address", () => {
    expect(securityTxt(null)).toBeNull();
  });
});

describe("proxy matcher", () => {
  const matcher = new RegExp(`^${config.matcher[0]}$`);

  it("leaves files served at the root alone", () => {
    for (const path of ["/.well-known/security.txt", "/robots.txt", "/sitemap.xml", "/api/scan", "/icon.svg"]) {
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
