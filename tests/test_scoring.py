from gitray.engine import Verdict
from gitray.engine.models import Finding
from gitray.engine.scoring import score, verdict_for


def finding(rule_id: str, weight: int) -> Finding:
    return Finding(
        rule_id=rule_id,
        title="t",
        category="c",
        path="p",
        line=1,
        snippet="s",
        why="w",
        weight=weight,
    )


def test_empty_is_clean() -> None:
    assert score([]) == (0, Verdict.CLEAN, {})


def test_repeated_rule_counts_once_with_max_weight() -> None:
    total, verdict, per_rule = score([finding("A", 5)] * 50 + [finding("A", 45)])
    assert per_rule == {"A": 45}
    assert total == 45
    assert verdict == Verdict.SUSPICIOUS


def test_doc_weight_finding_does_not_override_code_finding() -> None:
    total, _, _ = score([finding("GR-CODE-001", 45), finding("GR-CODE-001", 5)])
    assert total == 45


def test_sum_is_capped_at_100() -> None:
    total, verdict, _ = score([finding("A", 45), finding("B", 40), finding("C", 35)])
    assert total == 100
    assert verdict == Verdict.DANGEROUS


def test_thresholds() -> None:
    assert verdict_for(29) == Verdict.CLEAN
    assert verdict_for(30) == Verdict.SUSPICIOUS
    assert verdict_for(69) == Verdict.SUSPICIOUS
    assert verdict_for(70) == Verdict.DANGEROUS
