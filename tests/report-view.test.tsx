import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReportView } from "../src/components/ReportView";
import { tr } from "../src/i18n/dictionaries/tr";
import { I18nProvider } from "../src/i18n/provider";
import { toReport } from "../src/engine/report";
import type { DependencyCheck, ScanResult } from "../src/engine/types";
import { emptyStats } from "../src/engine/types";
import { SHA } from "./helpers";

function report(dependencyCheck: DependencyCheck) {
  const result: ScanResult = {
    repo: {
      fullName: "octo/demo",
      description: null,
      sizeKb: 1,
      createdAt: "2020-01-01T00:00:00Z",
      pushedAt: null,
      defaultBranch: "main",
      headSha: SHA,
      stars: 1,
      forks: 0,
      isFork: false,
      archived: false,
      ownerLogin: "octo",
      ownerType: "User",
      ownerCreatedAt: null,
      releaseAssets: [],
    },
    findings: [],
    score: 0,
    verdict: "clean",
    ruleScores: {},
    stats: emptyStats(),
    partial: null,
    archiveCheck: { status: "ok", hidden: 0, scanned: 0 },
    dependencyCheck,
    testFilesCapped: false,
    submodules: [],
    reputationCheck: { status: "none", files: [], notLookedUp: 0 },
    rulesRun: [],
    startedAt: "2026-10-01T00:00:00.000Z",
    durationMs: 5,
  };
  return toReport(result);
}

describe("ReportView test files", () => {
  it("labels findings in test files and explains a held verdict", () => {
    const r = report({ status: "none", packages: 0, malicious: 0 });
    const finding = {
      ruleId: "GR-CODE-002",
      title: "Downloads a script and pipes it into a shell",
      category: "code" as const,
      severity: "high" as const,
      weight: 35,
      path: "tests/pane.test.ts",
      line: 3,
      snippet: "curl x | sh",
      why: "w",
      note: null,
      docContext: false,
      githubUrl: null,
      inArchive: false,
      testContext: true,
    };
    const html = renderToStaticMarkup(
      <ReportView report={{ ...r, verdict: "suspicious", score: 69, testFilesCapped: true, findings: [finding] }} />,
    );
    expect(html).toContain("Held at Suspicious");
    expect(html).toContain("in a test file");
  });
});

describe("ReportView submodules", () => {
  it("lists them, links only validated GitHub names to our scan page and never the URL", () => {
    const r = report({ status: "none", packages: 0, malicious: 0 });
    const html = renderToStaticMarkup(
      <ReportView
        report={{
          ...r,
          submodules: [
            { path: "lib/ok", url: "hxxps://github[.]com/octo/ok", github: "octo/ok" },
            { path: "tools/x", url: "hxxps://evil[.]example[.]invalid/x.git", github: null },
          ],
        }}
      />,
    );
    expect(html).toContain("2 git submodules are not scanned");
    expect(html).toContain('href="/en/scan/octo/ok"');
    expect(html).toContain("hxxps://evil[.]example[.]invalid/x.git");
    expect(html).not.toContain('href="hxxps');
  });
});

describe("ReportView VirusTotal check", () => {
  const sha = "ab".repeat(32);
  it("shows each file looked up with a link built from its fingerprint", () => {
    const r = report({ status: "none", packages: 0, malicious: 0 });
    const html = renderToStaticMarkup(
      <ReportView
        report={{
          ...r,
          reputationCheck: {
            status: "found",
            notLookedUp: 12,
            files: [
              {
                source: "release",
                name: "v1/setup.exe",
                sha256: sha,
                virusTotalUrl: `https://www.virustotal.com/gui/file/${sha}`,
                reputation: { status: "found", stats: { malicious: 31, suspicious: 0, harmless: 0, undetected: 39 } },
              },
            ],
          },
        }}
      />,
    );
    expect(html).toContain("Antivirus engines (VirusTotal)");
    expect(html).toContain("Antivirus engines flag 1 of 1 file");
    expect(html).toContain("31/70 engines detect it");
    expect(html).toContain("12 more files were not looked up (at most 10 per scan)");
    expect(html).toContain(`href="https://www.virustotal.com/gui/file/${sha}"`);
  });

  it("explains when nothing was looked up", () => {
    const r = report({ status: "none", packages: 0, malicious: 0 });
    const html = renderToStaticMarkup(<ReportView report={{ ...r, reputationCheck: { status: "not_configured", files: [], notLookedUp: 0 } }} />);
    expect(html).toContain("Not looked up automatically on this site");
  });
});

describe("ReportView dependency check", () => {
  it("says how many packages OSV checked", () => {
    const html = renderToStaticMarkup(<ReportView report={report({ status: "ok", packages: 42, malicious: 0 })} />);
    expect(html).toContain("Malicious dependencies (OSV)");
    expect(html).toContain("Checked 42 packages");
  });

  it("explains a repository without dependency files instead of showing nothing", () => {
    const html = renderToStaticMarkup(<ReportView report={report({ status: "none", packages: 0, malicious: 0 })} />);
    expect(html).toContain("Malicious dependencies (OSV)");
    expect(html).toContain("nothing to check");
  });

  it("marks reports made before the check existed", () => {
    const old: Partial<ReturnType<typeof report>> = report({ status: "ok", packages: 1, malicious: 0 });
    delete old.dependencyCheck;
    const html = renderToStaticMarkup(<ReportView report={old as ReturnType<typeof report>} />);
    expect(html).toContain("older than the dependency check");
  });
});

describe("ReportView in Turkish", () => {
  it("translates the interface and rule texts, and links to the Turkish scan page", () => {
    const r = report({ status: "ok", packages: 3, malicious: 0 });
    const finding = {
      ruleId: "GR-SOC-001",
      title: "Asks you to disable your antivirus",
      category: "social" as const,
      severity: "medium" as const,
      weight: 25,
      path: "tests/readme.md",
      line: 1,
      snippet: "x",
      why: "English explanation",
      note: null,
      docContext: false,
      githubUrl: null,
      inArchive: false,
      testContext: true,
    };
    const html = renderToStaticMarkup(
      <I18nProvider locale="tr" dict={tr}>
        <ReportView
          report={{
            ...r,
            verdict: "suspicious",
            score: 69,
            testFilesCapped: true,
            findings: [finding],
            submodules: [{ path: "lib/ok", url: "hxxps://github[.]com/octo/ok", github: "octo/ok" }],
          }}
        />
      </I18nProvider>,
    );
    expect(html).toContain("Şüpheli&#x27;de tutuldu");
    expect(html).toContain("test dosyasında");
    expect(html).toContain("Antivirüsünüzü kapatmanızı istiyor");
    expect(html).toContain("sahte hile, crack ve araç repolarının imzasıdır");
    expect(html).toContain("3 paket, OSV");
    expect(html).toContain('href="/tr/scan/octo/ok"');
    expect(html).not.toContain("Score breakdown");
  });
});

describe("ReportView pattern context", () => {
  it("labels findings inside search patterns or comments", () => {
    const r = report({ status: "none", packages: 0, malicious: 0 });
    const finding = {
      ruleId: "GR-CODE-001",
      title: "Decodes hidden code and executes it",
      category: "code" as const,
      severity: "low" as const,
      weight: 5,
      path: "src/rules.ts",
      line: 3,
      snippet: "/iex.{0,120}frombase64string/i",
      why: "w",
      note: null,
      docContext: false,
      patternContext: true,
      githubUrl: null,
      inArchive: false,
      testContext: false,
    };
    const html = renderToStaticMarkup(<ReportView report={{ ...r, findings: [finding] }} />);
    expect(html).toContain("in a search pattern or comment, weight reduced");
  });
});
