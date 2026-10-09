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
    rulesRun: [],
    startedAt: "2026-10-01T00:00:00.000Z",
    durationMs: 5,
  };
  return toReport(result);
}

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
