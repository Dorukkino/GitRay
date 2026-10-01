"""GitRay scan engine. Pure Python: no dependency on web, database or worker code."""

from gitray.engine.errors import (
    ArchiveError,
    GitHubError,
    GitRayError,
    InvalidTarget,
    LimitExceeded,
)
from gitray.engine.github import GitHubClient
from gitray.engine.limits import Limits
from gitray.engine.models import Finding, RepoRef, ScanResult, Verdict
from gitray.engine.scanner import scan_repo, scan_tarball
from gitray.engine.target import parse_target

__all__ = [
    "ArchiveError",
    "Finding",
    "GitHubClient",
    "GitHubError",
    "GitRayError",
    "InvalidTarget",
    "LimitExceeded",
    "Limits",
    "RepoRef",
    "ScanResult",
    "Verdict",
    "parse_target",
    "scan_repo",
    "scan_tarball",
]
