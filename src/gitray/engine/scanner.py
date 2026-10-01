"""Scan orchestration: repo metadata -> tarball -> rules -> score."""

from collections.abc import Iterable, Sequence

from gitray.engine import scoring
from gitray.engine.archive import ArchiveReader
from gitray.engine.errors import LimitExceeded
from gitray.engine.github import GitHubClient
from gitray.engine.limits import Limits
from gitray.engine.models import (
    ArchiveStats,
    FileEntry,
    Finding,
    PartialScan,
    RepoInfo,
    RepoRef,
    ScanContext,
    ScanResult,
)
from gitray.engine.rules import Rule, all_rules


def scan_file(file: FileEntry, rules: Sequence[Rule], context: ScanContext) -> list[Finding]:
    findings: list[Finding] = []
    for rule in rules:
        findings.extend(rule.scan(file, context))
    return findings


def _result(
    repo: RepoInfo | None,
    findings: list[Finding],
    stats: ArchiveStats,
    partial: PartialScan | None,
    rules: Sequence[Rule],
) -> ScanResult:
    total, verdict, per_rule = scoring.score(findings, complete=partial is None)
    return ScanResult(
        repo=repo,
        findings=tuple(findings),
        score=total,
        verdict=verdict,
        rule_scores=per_rule,
        stats=stats,
        partial=partial,
        rules_run=tuple(r.id for r in rules),
    )


def _partial(e: LimitExceeded) -> PartialScan:
    return PartialScan(limit=e.limit, limit_value=e.value, reason=str(e))


def scan_tarball(
    chunks: Iterable[bytes],
    limits: Limits,
    *,
    repo: RepoInfo | None = None,
    rules: Sequence[Rule] | None = None,
) -> ScanResult:
    """Scan a gzipped tarball stream. A limit hit mid-archive gives a partial result."""
    rules = all_rules() if rules is None else rules
    context = ScanContext(repo=repo.ref if repo else None)
    reader = ArchiveReader(chunks, limits)
    findings: list[Finding] = []
    partial = None
    try:
        for entry in reader:
            findings.extend(scan_file(entry, rules, context))
    except LimitExceeded as e:
        partial = _partial(e)
    return _result(repo, findings, reader.stats, partial, rules)


def scan_repo(ref: RepoRef, client: GitHubClient, limits: Limits | None = None) -> ScanResult:
    """Scan a repository. Every limit hit, even before download, gives an Incomplete result."""
    limits = limits or Limits()
    info = client.fetch_repo_info(ref)
    try:
        if info.size_kb > limits.max_repo_size_kb:
            raise LimitExceeded(
                "max_repo_size_kb",
                limits.max_repo_size_kb,
                f"repository is {info.size_kb} KB, limit is {limits.max_repo_size_kb} KB",
            )
        with client.stream_tarball(info.ref, info.head_sha, limits) as chunks:
            return scan_tarball(chunks, limits, repo=info)
    except LimitExceeded as e:
        # Raised before any file was read (size pre-check, Content-Length).
        return _result(info, [], ArchiveStats(), _partial(e), all_rules())
