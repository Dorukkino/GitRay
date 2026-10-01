"""Scan orchestration: repo metadata -> tarball -> rules -> score."""

from collections.abc import Iterable, Sequence

from gitray.engine import scoring
from gitray.engine.archive import ArchiveReader
from gitray.engine.errors import LimitExceeded
from gitray.engine.github import GitHubClient
from gitray.engine.limits import Limits
from gitray.engine.models import (
    FileEntry,
    Finding,
    PartialScan,
    RepoInfo,
    RepoRef,
    ScanResult,
)
from gitray.engine.rules import Rule, all_rules


def scan_file(file: FileEntry, rules: Sequence[Rule]) -> list[Finding]:
    findings: list[Finding] = []
    for rule in rules:
        findings.extend(rule.scan(file))
    return findings


def scan_tarball(
    chunks: Iterable[bytes],
    limits: Limits,
    *,
    repo: RepoInfo | None = None,
    rules: Sequence[Rule] | None = None,
) -> ScanResult:
    """Scan a gzipped tarball stream. A limit hit mid-archive gives a partial result."""
    rules = all_rules() if rules is None else rules
    reader = ArchiveReader(chunks, limits)
    findings: list[Finding] = []
    partial = None
    try:
        for entry in reader:
            findings.extend(scan_file(entry, rules))
    except LimitExceeded as e:
        partial = PartialScan(limit=e.limit, limit_value=e.value, reason=str(e))
    total, verdict, per_rule = scoring.score(findings, complete=partial is None)
    return ScanResult(
        repo=repo,
        findings=tuple(findings),
        score=total,
        verdict=verdict,
        rule_scores=per_rule,
        stats=reader.stats,
        partial=partial,
        rules_run=tuple(r.id for r in rules),
    )


def scan_repo(ref: RepoRef, client: GitHubClient, limits: Limits | None = None) -> ScanResult:
    limits = limits or Limits()
    info = client.fetch_repo_info(ref)
    if info.size_kb > limits.max_repo_size_kb:
        raise LimitExceeded(
            "max_repo_size_kb",
            limits.max_repo_size_kb,
            f"repository is {info.size_kb} KB, limit is {limits.max_repo_size_kb} KB",
        )
    with client.stream_tarball(ref, info.head_sha, limits) as chunks:
        return scan_tarball(chunks, limits, repo=info)
