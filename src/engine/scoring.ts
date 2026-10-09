/** Turn findings into a 0-100 score and a verdict. */

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

export function score(
  findings: Iterable<Finding>,
  complete = true,
): { score: number; verdict: Verdict; ruleScores: Record<string, number> } {
  const perRule = ruleScores(findings);
  const total = Math.min(
    MAX_SCORE,
    Object.values(perRule).reduce((a, b) => a + b, 0),
  );
  let verdict = verdictFor(total);
  // A partial scan is never called clean: the unread part may hold the payload.
  if (!complete && verdict === "clean") verdict = "incomplete";
  return { score: total, verdict, ruleScores: perRule };
}
