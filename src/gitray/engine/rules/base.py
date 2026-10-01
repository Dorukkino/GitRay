"""Rule definitions. Shaped so that Stage 2 can load the same fields from YAML."""

import re
from abc import ABC, abstractmethod
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field
from pathlib import PurePosixPath

from gitray.engine import text
from gitray.engine.models import FileEntry, Finding


@dataclass(frozen=True)
class Hit:
    line: int
    text: str
    # Overrides the rule weight for this hit (e.g. an escalated install script).
    weight: int | None = None
    note: str | None = None


def path_matches(path: str, patterns: Iterable[str]) -> bool:
    p = PurePosixPath(path)
    return any(p.match(pattern, case_sensitive=False) for pattern in patterns)


@dataclass(frozen=True, kw_only=True)
class Rule(ABC):
    id: str
    title: str
    category: str
    weight: int
    why: str
    applies_to: tuple[str, ...] = ("*",)
    exclude: tuple[str, ...] = ()
    # Weight inside documentation files; None means "same as weight", 0 disables.
    doc_weight: int | None = None

    def applies(self, path: str) -> bool:
        return path_matches(path, self.applies_to) and not path_matches(path, self.exclude)

    @abstractmethod
    def hits(self, file: FileEntry) -> Iterable[Hit]: ...

    def scan(self, file: FileEntry) -> list[Finding]:
        if not self.applies(file.path):
            return []
        doc_context = self.doc_weight is not None and text.is_doc_path(file.path)
        if doc_context and self.doc_weight == 0:
            return []
        findings = []
        for hit in self.hits(file):
            weight = hit.weight if hit.weight is not None else self.weight
            if doc_context and self.doc_weight is not None:
                weight = min(weight, self.doc_weight)
            findings.append(
                Finding(
                    rule_id=self.id,
                    title=self.title,
                    category=self.category,
                    path=file.path,
                    line=hit.line,
                    snippet=text.snippet(hit.text),
                    why=self.why,
                    weight=weight,
                    doc_context=doc_context,
                    note=hit.note,
                )
            )
        return findings


@dataclass(frozen=True, kw_only=True)
class RegexRule(Rule):
    """Reports each line that matches any pattern (at most one hit per line)."""

    patterns: tuple[re.Pattern[str], ...] = field(default=())

    def hits(self, file: FileEntry) -> Iterator[Hit]:
        last_line = 0
        for lineno, segment in text.iter_scan_lines(file.content):
            if lineno == last_line:
                continue
            if any(p.search(segment) for p in self.patterns):
                last_line = lineno
                yield Hit(line=lineno, text=segment)


def compile_all(*patterns: str, flags: int = 0) -> tuple[re.Pattern[str], ...]:
    return tuple(re.compile(p, flags) for p in patterns)
