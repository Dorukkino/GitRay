import { describe, expect, it } from "vitest";

import { DANGEROUS_AT, SUSPICIOUS_AT, ruleScores, score, verdictFor } from "../src/engine/scoring";
import type { Finding } from "../src/engine/types";

function finding(ruleId: string, weight: number): Finding {
  return { ruleId, title: "", category: "code", path: "a", line: 1, snippet: "", why: "", weight, docContext: false, note: null };
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
});
