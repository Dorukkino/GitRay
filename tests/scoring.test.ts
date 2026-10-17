import { describe, expect, it } from "vitest";

import { DANGEROUS_AT, SUSPICIOUS_AT, ruleScores, score, verdictFor } from "../src/engine/scoring";
import type { Finding } from "../src/engine/types";

function finding(ruleId: string, weight: number, path = "a", category: Finding["category"] = "code"): Finding {
  return { ruleId, title: "", category, path, line: 1, snippet: "", why: "", weight, docContext: false, note: null };
}

describe("scoring", () => {
  it("counts each rule once with its highest weight", () => {
    expect(ruleScores([finding("A", 10), finding("A", 35), finding("B", 5)])).toEqual({ A: 35, B: 5 });
  });

  it("caps the total at 100", () => {
    expect(score([finding("A", 60), finding("B", 60)]).score).toBe(100);
  });

  it("maps scores to verdicts", () => {
    expect(verdictFor(0)).toBe("clean");
    expect(verdictFor(SUSPICIOUS_AT - 1)).toBe("clean");
    expect(verdictFor(SUSPICIOUS_AT)).toBe("suspicious");
    expect(verdictFor(DANGEROUS_AT - 1)).toBe("suspicious");
    expect(verdictFor(DANGEROUS_AT)).toBe("dangerous");
  });

  it("never calls a partial scan clean, but keeps worse verdicts", () => {
    expect(score([], false).verdict).toBe("incomplete");
    expect(score([finding("A", 20)], false).verdict).toBe("incomplete");
    expect(score([finding("A", 35)], false).verdict).toBe("suspicious");
    expect(score([finding("A", 80)], false).verdict).toBe("dangerous");
  });

  it("test-file findings never raise the verdict band; the score becomes the non-test score", () => {
    // Non-test findings are suspicious-level: the score is the non-test total.
    const held = score([finding("A", 60, "tests/views/pane.test.ts"), finding("C", 35, "README.md")]);
    expect(held).toMatchObject({ score: 35, verdict: "suspicious", testFilesCapped: true });
    expect(held.ruleScores).toEqual({ A: 60, C: 35 });

    // Non-test findings are clean-level: test findings cannot even make it suspicious.
    const clean = score([finding("A", 35, "tests/pane.test.ts"), finding("B", 15, "tests/x.ts"), finding("C", 20, "README.md")]);
    expect(clean).toMatchObject({ score: 20, verdict: "clean", testFilesCapped: true });
    expect(clean.ruleScores).toEqual({ A: 35, B: 15, C: 20 });
  });

  it("does not hold it when something auto-runs or the non-test findings stand on their own", () => {
    const tests = [finding("A", 45, "tests/setup.js"), finding("B", 15, "tests/setup.js")];
    const autorun = score([...tests, finding("AUTO", 10, "package.json", "autorun")]);
    expect(autorun).toMatchObject({ score: 70, verdict: "dangerous", testFilesCapped: false });
    // GR-AUTO-008 (MCP servers / AI hooks) is opt-in and does not count as auto-run here.
    const mcp = score([finding("A", 35, "tests/a.test.ts"), finding("GR-AUTO-008", 10, ".mcp.json", "autorun")]);
    expect(mcp).toMatchObject({ score: 10, verdict: "clean", testFilesCapped: true });
    const outside = score([finding("A", 40, "spec/a.js"), finding("B", 35, "src/a.js"), finding("C", 35, "src/b.js")]);
    expect(outside).toMatchObject({ verdict: "dangerous", testFilesCapped: false });
  });
});
