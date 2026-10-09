import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RepoList } from "../src/components/RepoList";
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
    const html = renderToStaticMarkup(<RepoList items={[item]} showReasons />);
    expect(html).toContain('href="/scan/evil-org/free-tool"');
    expect(html).toContain("Asks you to disable your antivirus");
    expect(html).toContain("score 95");
  });

  it("escapes stored text instead of rendering it as HTML", () => {
    const html = renderToStaticMarkup(<RepoList items={[item]} showReasons={false} />);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x");
    expect(html).not.toContain("disable your antivirus");
  });
});
