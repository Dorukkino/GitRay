import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RepoList } from "../src/components/RepoList";
import { en } from "../src/i18n/dictionaries/en";
import { tr } from "../src/i18n/dictionaries/tr";
import type { ScanSummary } from "../src/lib/scan-store";

const item: ScanSummary = {
  fullName: "evil-org/free-tool",
  headSha: "0123456789abcdef0123456789abcdef01234567",
  verdict: "dangerous",
  score: 95,
  description: '<img src=x onerror="alert(1)"> Free tool',
  stars: 12,
  findings: 7,
  topRules: [{ id: "GR-SOC-001", title: "Asks you to disable your antivirus", points: 25 }],
  scannedAt: "2026-10-09T10:00:00.000Z",
};

describe("RepoList", () => {
  it("links to the scan page and shows why a repository is listed", () => {
    const html = renderToStaticMarkup(<RepoList items={[item]} showReasons locale="en" dict={en} />);
    expect(html).toContain('href="/en/scan/evil-org/free-tool"');
    expect(html).toContain("Asks you to disable your antivirus");
    expect(html).toContain("score 95");
  });

  it("escapes stored text instead of rendering it as HTML", () => {
    const html = renderToStaticMarkup(<RepoList items={[item]} showReasons={false} locale="en" dict={en} />);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x");
    expect(html).not.toContain("disable your antivirus");
  });

  it("speaks Turkish, including the rule titles stored in English", () => {
    const html = renderToStaticMarkup(<RepoList items={[item]} showReasons locale="tr" dict={tr} />);
    expect(html).toContain('href="/tr/scan/evil-org/free-tool"');
    expect(html).toContain("Antivirüsünüzü kapatmanızı istiyor");
    expect(html).toContain("Tehlikeli");
    expect(html).toContain("puan 95");
  });

  it("shows reasons only for repositories that are not clean", () => {
    const clean = { ...item, fullName: "ok-org/tool", verdict: "clean" as const, score: 10 };
    const html = renderToStaticMarkup(<RepoList items={[clean]} showReasons locale="en" dict={en} />);
    expect(html).not.toContain("disable your antivirus");
  });
});
