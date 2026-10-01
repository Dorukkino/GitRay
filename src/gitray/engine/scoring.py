"""Turn findings into a 0-100 score and a verdict."""

from collections.abc import Iterable

from gitray.engine.models import Finding, Verdict

MAX_SCORE = 100
SUSPICIOUS_AT = 30
DANGEROUS_AT = 70


def rule_scores(findings: Iterable[Finding]) -> dict[str, int]:
    """Each rule counts once, with the highest effective weight among its findings."""
    scores: dict[str, int] = {}
    for f in findings:
        scores[f.rule_id] = max(scores.get(f.rule_id, 0), f.weight)
    return scores


def verdict_for(score: int) -> Verdict:
    if score >= DANGEROUS_AT:
        return Verdict.DANGEROUS
    if score >= SUSPICIOUS_AT:
        return Verdict.SUSPICIOUS
    return Verdict.CLEAN


def score(
    findings: Iterable[Finding], *, complete: bool = True
) -> tuple[int, Verdict, dict[str, int]]:
    per_rule = rule_scores(findings)
    total = min(MAX_SCORE, sum(per_rule.values()))
    verdict = verdict_for(total)
    # A partial scan can never be called clean: the unread part may hold the payload.
    if not complete and verdict == Verdict.CLEAN:
        verdict = Verdict.INCOMPLETE
    return total, verdict, per_rule
