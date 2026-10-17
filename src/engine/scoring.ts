/** Turn findings into a 0-100 score and a verdict. */

import { isTestPath, referencesTestPath } from "./text";
import type { Finding, Verdict } from "./types";

export const MAX_SCORE = 100;
export const SUSPICIOUS_AT = 30;
export const DANGEROUS_AT = 70;

/** Each rule counts once, with the highest weight among its findings. */
export function ruleScores(findings: Iterable<Finding>): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const f of findings) scores[f.ruleId] = Math.max(scores[f.ruleId] ?? 0, f.weight);
  return scores;
}

export function verdictFor(score: number): Verdict {
  if (score >= DANGEROUS_AT) return "dangerous";
  if (score >= SUSPICIOUS_AT) return "suspicious";
  return "clean";
}

function total(perRule: Record<string, number>): number {
  return Math.min(
    MAX_SCORE,
    Object.values(perRule).reduce((a, b) => a + b, 0),
  );
}

export interface Scored {
  score: number;
  verdict: Verdict;
  ruleScores: Record<string, number>;
  /**
   * Findings in test files pushed the score to "dangerous" on their own and were
   * held at "suspicious": see score().
   */
  testFilesCapped: boolean;
}

export function score(findings: Iterable<Finding>, complete = true): Scored {
  const list = [...findings];
  const perRule = ruleScores(list);
  let points = total(perRule);
  let testFilesCapped = false;
  // Test code does not run on clone or install, and security tools keep attack
  // samples in their tests (bidi strings, secret-shaped paths). Findings there
  // still count in full, but on their own they never raise the verdict band: a
  // repository whose only strong findings are in tests stays whatever the files
  // outside its tests say. The exception is a non-test autorun finding that runs
  // on clone, install or folder-open (an install script, a folder-open task) and
  // that actually starts a test-folder file (`postinstall: node tests/setup.js`).
  // A non-test autorun whose command does not reference the tests (patch-package,
  // tsc) cannot launch the payload, so it does not disable the cap. GR-AUTO-008
  // (AI-assistant hooks and MCP servers) is opt-in — the user configures the
  // assistant — so it never counts here.
  const outside = list.filter((f) => !isTestPath(f.path));
  const launchesTest = outside.some(
    (f) => f.category === "autorun" && f.ruleId !== "GR-AUTO-008" && referencesTestPath(f.snippet),
  );
  if (!launchesTest) {
    const outsideScore = total(ruleScores(outside));
    // The score becomes the non-test score itself, so the gauge matches the
    // findings that actually counted. Not when the non-test findings are already
    // dangerous: there the test findings just add within the same band.
    if (outsideScore < DANGEROUS_AT && points > outsideScore) {
      points = outsideScore;
      testFilesCapped = true;
    }
  }
  let verdict = verdictFor(points);
  // A partial scan is never called clean: the unread part may hold the payload.
  if (!complete && verdict === "clean") verdict = "incomplete";
  return { score: points, verdict, ruleScores: perRule, testFilesCapped };
}
