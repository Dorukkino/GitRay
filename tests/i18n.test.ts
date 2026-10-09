/** Languages: locale picking, paths, and that every translation matches English. */

import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { allRules } from "../src/engine";
import { localeOf, negotiateLocale, pickLocale, scanPath, switchLocalePath } from "../src/i18n/config";
import { DICTIONARIES } from "../src/i18n/dictionaries";
import { en } from "../src/i18n/dictionaries/en";
import { fmt, plural, relativeTime } from "../src/i18n/format";
import { proxy } from "../src/proxy";

describe("locale negotiation", () => {
  it("follows Accept-Language by quality and primary subtag", () => {
    expect(negotiateLocale("tr-TR,tr;q=0.9,en;q=0.8")).toBe("tr");
    expect(negotiateLocale("de-DE,de;q=0.9,en-US;q=0.5,tr;q=0.4")).toBe("en");
    expect(negotiateLocale("en;q=0.2, tr;q=0.7")).toBe("tr");
    expect(negotiateLocale("tr;q=0, en")).toBe("en");
    expect(negotiateLocale("de, fr")).toBeNull();
    expect(negotiateLocale("")).toBeNull();
    expect(negotiateLocale(null)).toBeNull();
  });

  it("lets the switcher's cookie win and falls back to English", () => {
    expect(pickLocale("tr", "en-US")).toBe("tr");
    expect(pickLocale("xx", "tr")).toBe("tr");
    expect(pickLocale(undefined, "ja")).toBe("en");
  });
});

describe("locale paths", () => {
  it("reads and switches the locale prefix", () => {
    expect(localeOf("/tr/rules")).toBe("tr");
    expect(localeOf("/en")).toBe("en");
    expect(localeOf("/scan/a/b")).toBeNull();
    expect(localeOf("/trx/rules")).toBeNull();
    expect(switchLocalePath("/tr/scan/a/b", "en")).toBe("/en/scan/a/b");
    expect(switchLocalePath("/en", "tr")).toBe("/tr");
    expect(scanPath("tr", "a b", "c/d")).toBe("/tr/scan/a%20b/c%2Fd");
  });
});

describe("proxy", () => {
  const request = (path: string, headers: Record<string, string> = {}) => new NextRequest(`https://gitray.test${path}`, { headers });

  it("sends paths without a language to the visitor's language", () => {
    const tr = proxy(request("/scan/octo/demo?fresh=1", { "accept-language": "tr-TR,tr;q=0.9" }));
    expect(tr.status).toBe(307);
    expect(tr.headers.get("location")).toBe("https://gitray.test/tr/scan/octo/demo?fresh=1");
    const home = proxy(request("/", { "accept-language": "de" }));
    expect(home.headers.get("location")).toBe("https://gitray.test/en");
    const chosen = proxy(request("/rules", { "accept-language": "en", cookie: "gitray-lang=tr" }));
    expect(chosen.headers.get("location")).toBe("https://gitray.test/tr/rules");
  });

  it("leaves paths that already have a language alone", () => {
    const r = proxy(request("/tr/rules"));
    expect(r.headers.get("location")).toBeNull();
    expect(r.headers.get("x-middleware-next")).toBe("1");
  });
});

/** Walks two dictionaries side by side and reports texts whose placeholders differ. */
function compare(a: unknown, b: unknown, path: string, problems: string[]) {
  if (typeof a === "string") {
    if (typeof b !== "string") return problems.push(`${path}: not a string`);
    const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    if (names(a) !== names(b)) problems.push(`${path}: {${names(a)}} vs {${names(b)}}`);
    return;
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return problems.push(`${path}: array length differs`);
    a.forEach((x, i) => compare(x, b[i], `${path}[${i}]`, problems));
    return;
  }
  if (typeof a === "object" && a !== null) {
    for (const key of Object.keys(a)) compare((a as Record<string, unknown>)[key], (b as Record<string, unknown>)?.[key], `${path}.${key}`, problems);
  }
}

describe("dictionaries", () => {
  it.each(Object.entries(DICTIONARIES))("%s uses the same placeholders as English", (_name, dict) => {
    const problems: string[] = [];
    // These maps are keyed by id and may be partial; checked separately below.
    const strip = (d: typeof en) => ({ ...d, rules: {}, scan: { ...d.scan, errorMessages: {}, errorHelp: {} } });
    compare(strip(en), strip(dict), "", problems);
    expect(problems).toEqual([]);
  });

  it.each(Object.entries(DICTIONARIES).filter(([name]) => name !== "en"))("%s translates every rule, and only real rules", (_name, dict) => {
    const ids = allRules().map((r) => r.id).sort();
    expect(Object.keys(dict.rules).sort()).toEqual(ids);
    for (const id of ids) {
      expect(dict.rules[id].title.length).toBeGreaterThan(5);
      expect(dict.rules[id].why.length).toBeGreaterThan(40);
    }
  });

  it.each(Object.entries(DICTIONARIES))("%s explains every error code English explains", (_name, dict) => {
    for (const code of Object.keys(en.scan.errorHelp)) {
      expect(dict.scan.errorHelp[code] ?? dict.scan.errorMessages[code], code).toBeTruthy();
    }
  });
});

describe("format helpers", () => {
  it("fills placeholders and picks plural forms", () => {
    expect(fmt("{a} and {b} and {c}", { a: 1, b: "x" })).toBe("1 and x and {c}");
    expect(plural("en", 1, { one: "{n} file", other: "{n} files" })).toBe("1 file");
    expect(plural("en", 3, { one: "{n} file", other: "{n} files" })).toBe("3 files");
    expect(plural("tr", 3, { one: "{n} dosya", other: "{n} dosya" })).toBe("3 dosya");
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-10-09T12:00:00Z");
  it("says how long ago a scan was, in the page's language", () => {
    expect(relativeTime("en", "2026-10-09T11:59:40Z", now)).toBe("now");
    expect(relativeTime("en", "2026-10-09T11:57:00Z", now)).toBe("3 minutes ago");
    expect(relativeTime("tr", "2026-10-09T10:00:00Z", now)).toBe("2 saat önce");
    expect(relativeTime("tr", "2026-10-08T12:00:00Z", now)).toBe("dün");
  });
});
