"""Every rule is tested against harmless fake samples in tests/fixtures/rules/.

Fixture format (header lines, then "# ---", then the virtual file content):

    # path: <virtual path inside the repo>
    # lines: 3, 5        (positive only: expected finding lines)
    # weight: 45         (optional: expected highest effective weight)
    # ---
    <content>
"""

from dataclasses import dataclass
from pathlib import Path

import pytest

from gitray.engine.models import FileEntry
from gitray.engine.rules import all_rules, get_rule

FIXTURES = Path(__file__).parent / "fixtures" / "rules"


@dataclass(frozen=True)
class Fixture:
    rule_id: str
    kind: str
    name: str
    path: str
    lines: tuple[int, ...]
    weight: int | None
    content: str


def load(file: Path) -> Fixture:
    raw = file.read_text(encoding="utf-8")
    header, _, content = raw.partition("# ---\n")
    meta = {}
    for line in header.splitlines():
        key, _, value = line.removeprefix("# ").partition(":")
        meta[key.strip()] = value.strip()
    lines = tuple(int(x) for x in meta["lines"].split(",")) if "lines" in meta else ()
    return Fixture(
        rule_id=file.parent.parent.name,
        kind=file.parent.name,
        name=file.stem,
        path=meta["path"],
        lines=lines,
        weight=int(meta["weight"]) if "weight" in meta else None,
        content=content,
    )


ALL_FIXTURES = [load(f) for f in sorted(FIXTURES.glob("*/*/*.fixture"))]


def fixture_id(f: Fixture) -> str:
    return f"{f.rule_id}/{f.kind}/{f.name}"


@pytest.mark.parametrize("fx", [f for f in ALL_FIXTURES if f.kind == "positive"], ids=fixture_id)
def test_positive_fixture(fx: Fixture) -> None:
    findings = get_rule(fx.rule_id).scan(FileEntry(path=fx.path, content=fx.content))
    assert fx.lines, "positive fixtures must declare expected lines"
    assert sorted({f.line for f in findings}) == sorted(fx.lines)
    assert all(f.rule_id == fx.rule_id and f.path == fx.path for f in findings)
    if fx.weight is not None:
        assert max(f.weight for f in findings) == fx.weight


@pytest.mark.parametrize("fx", [f for f in ALL_FIXTURES if f.kind == "negative"], ids=fixture_id)
def test_negative_fixture(fx: Fixture) -> None:
    findings = get_rule(fx.rule_id).scan(FileEntry(path=fx.path, content=fx.content))
    assert findings == []


@pytest.mark.parametrize("rule", all_rules(), ids=lambda r: r.id)
def test_every_rule_has_positive_and_negative_fixtures(rule) -> None:  # type: ignore[no-untyped-def]
    kinds = {f.kind for f in ALL_FIXTURES if f.rule_id == rule.id}
    assert kinds == {"positive", "negative"}, f"{rule.id} needs positive and negative fixtures"


def test_fixture_dirs_match_registered_rules() -> None:
    registered = {r.id for r in all_rules()}
    assert {f.rule_id for f in ALL_FIXTURES} == registered


def test_rule_ids_unique_and_metadata_complete() -> None:
    rules = all_rules()
    assert len({r.id for r in rules}) == len(rules) == 10
    for r in rules:
        assert r.title and r.why and r.category
        assert 1 <= r.weight <= 100


def test_only_code_rules_are_down_weighted_in_docs() -> None:
    for r in all_rules():
        if r.doc_weight is not None:
            assert r.id.startswith("GR-CODE-"), r.id
    for r in all_rules():
        if r.id.startswith("GR-CODE-"):
            assert r.doc_weight is not None and r.doc_weight < r.weight


def test_link_rule_in_readme_has_full_weight_and_no_doc_context() -> None:
    rule = get_rule("GR-LINK-001")
    findings = rule.scan(FileEntry(path="README.md", content="Get it: https://bit.ly/3abcdef\n"))
    assert len(findings) == 1
    assert findings[0].weight == rule.weight == 20
    assert not findings[0].doc_context


def test_code_rule_in_doc_marks_doc_context() -> None:
    findings = get_rule("GR-CODE-004").scan(
        FileEntry(path="README.md", content="cat ~/.ssh/id_rsa\n")
    )
    assert findings[0].doc_context and findings[0].weight == 3


def test_npm_escalation_note() -> None:
    fx = next(f for f in ALL_FIXTURES if f.name == "postinstall_risky")
    (finding,) = get_rule("GR-AUTO-001").scan(FileEntry(path=fx.path, content=fx.content))
    assert finding.note and "network or shell" in finding.note


def test_payload_beyond_first_window_of_long_line_is_found() -> None:
    line = "x=1;" * 5000 + 'eval(atob("Y29uc29sZS5sb2coMSk="));'
    findings = get_rule("GR-CODE-001").scan(FileEntry(path="big.js", content=line))
    assert [f.line for f in findings] == [1]
