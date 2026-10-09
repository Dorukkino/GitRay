import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReportView } from "../src/components/ReportView";
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
    expect(html).toContain('href="/scan/octo/ok"');
    expect(html).toContain("hxxps://evil[.]example[.]invalid/x.git");
    expect(html).not.toContain('href="hxxps');
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
