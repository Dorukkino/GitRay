"""Rule registry."""

from gitray.engine.rules import autorun, code_patterns, links, obfuscation
from gitray.engine.rules.base import Hit, RegexRule, Rule

_ALL: tuple[Rule, ...] = (
    *code_patterns.RULES,
    *autorun.RULES,
    *obfuscation.RULES,
    *links.RULES,
)


def all_rules() -> tuple[Rule, ...]:
    return _ALL


def get_rule(rule_id: str) -> Rule:
    for rule in _ALL:
        if rule.id == rule_id:
            return rule
    raise KeyError(rule_id)


__all__ = ["Hit", "RegexRule", "Rule", "all_rules", "get_rule"]
