"""Plain data types shared by the engine, CLI and (later) web and worker."""

from dataclasses import dataclass, field
from enum import StrEnum


class Verdict(StrEnum):
    CLEAN = "clean"
    SUSPICIOUS = "suspicious"
    DANGEROUS = "dangerous"
    # A limit stopped the scan and the part that was read looked clean. Never
    # replaces SUSPICIOUS or DANGEROUS: those stand even when the scan is partial.
    INCOMPLETE = "incomplete"


class DigestStatus(StrEnum):
    AVAILABLE = "available"
    # GitHub gave no digest for the asset; the release cannot be checked.
    UNAVAILABLE = "unavailable"


@dataclass(frozen=True)
class RepoRef:
    owner: str
    repo: str

    @property
    def full_name(self) -> str:
        return f"{self.owner}/{self.repo}"


@dataclass(frozen=True)
class ScanContext:
    """What rules may know about the scan beyond the file itself."""

    # The repository being scanned; None when scanning a bare tarball.
    repo: RepoRef | None = None


@dataclass(frozen=True)
class ReleaseAsset:
    release_tag: str
    name: str
    size: int
    digest: str | None

    @property
    def digest_status(self) -> DigestStatus:
        return DigestStatus.AVAILABLE if self.digest else DigestStatus.UNAVAILABLE


@dataclass(frozen=True)
class RepoInfo:
    full_name: str
    size_kb: int
    created_at: str
    pushed_at: str | None
    default_branch: str
    head_sha: str
    owner_login: str
    owner_type: str
    owner_created_at: str | None
    release_assets: tuple[ReleaseAsset, ...] = ()

    @property
    def ref(self) -> RepoRef:
        """Canonical owner/repo as reported by the GitHub API."""
        owner, _, repo = self.full_name.partition("/")
        return RepoRef(owner=owner, repo=repo)


@dataclass(frozen=True)
class FileEntry:
    path: str
    content: str
    truncated: bool = False


@dataclass(frozen=True)
class Finding:
    rule_id: str
    title: str
    category: str
    path: str
    line: int
    snippet: str
    why: str
    weight: int
    doc_context: bool = False
    note: str | None = None


@dataclass
class ArchiveStats:
    entries_seen: int = 0
    files_scanned: int = 0
    skipped_non_regular: int = 0
    skipped_binary: int = 0
    truncated_files: int = 0
    downloaded_bytes: int = 0
    decompressed_bytes: int = 0


@dataclass(frozen=True)
class PartialScan:
    """Why a scan stopped early: the Limits field that was exceeded and its value."""

    limit: str
    limit_value: int
    reason: str


@dataclass(frozen=True)
class ScanResult:
    repo: RepoInfo | None
    findings: tuple[Finding, ...]
    score: int
    verdict: Verdict
    rule_scores: dict[str, int]
    stats: ArchiveStats
    partial: PartialScan | None = None
    rules_run: tuple[str, ...] = field(default=())

    @property
    def complete(self) -> bool:
        return self.partial is None
