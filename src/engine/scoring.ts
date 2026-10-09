/** Turn findings into a 0-100 score and a verdict. */

import { isTestPath } from "./text";
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
  if (points >= DANGEROUS_AT) {
    // Test code does not run on clone or install, and security tools keep attack
    // samples in their tests. Findings there still count in full, but on their own
    // they make a repository at most suspicious. Not when something runs by itself
    // (an install script, a folder-open task): that could start the test file.
    const outside = list.filter((f) => !isTestPath(f.path));
    const autorun = outside.some((f) => f.category === "autorun");
    if (!autorun && total(ruleScores(outside)) < DANGEROUS_AT) {
      points = DANGEROUS_AT - 1;
      testFilesCapped = true;
    }
  }
  let verdict = verdictFor(points);
  // A partial scan is never called clean: the unread part may hold the payload.
  if (!complete && verdict === "clean") verdict = "incomplete";
  return { score: points, verdict, ruleScores: perRule, testFilesCapped };
}
