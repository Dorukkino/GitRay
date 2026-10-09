import { describe, expect, it } from "vitest";

import { allRules } from "../src/engine/rules";
import { buildDemoReport } from "../src/lib/demo";

describe("demo report", () => {
  it("is built by the real engine and shows most rule categories", async () => {
    const report = await buildDemoReport(new Date("2026-10-09T12:00:00Z"));
    expect(report.verdict).toBe("dangerous");
    expect(report.findings.every((f) => f.githubUrl === null)).toBe(true);
    const categories = new Set(report.rules.map((r) => r.category));
    for (const c of ["autorun", "code", "obfuscation", "links", "social", "binary", "repo"]) expect(categories).toContain(c);
    expect(report.rules.length).toBeGreaterThanOrEqual(allRules().length / 2);
  });
});
