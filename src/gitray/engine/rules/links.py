"""GR-LINK-*: suspicious links in README and other documentation."""

import re
from collections.abc import Iterator
from dataclasses import dataclass
from urllib.parse import urlsplit

from gitray.engine import text
from gitray.engine.models import FileEntry, RepoRef, ScanContext
from gitray.engine.rules.base import Hit, Rule

ARCHIVE_EXTENSIONS = (".zip", ".exe", ".msi", ".rar", ".7z")
SHORTENERS = frozenset(
    {
        "bit.ly",
        "tinyurl.com",
        "t.co",
        "goo.gl",
        "is.gd",
        "ow.ly",
        "cutt.ly",
        "rb.gy",
        "shorturl.at",
        "rebrand.ly",
        "t.ly",
        "tiny.cc",
        "buff.ly",
    }
)

_URL = re.compile(r"https?://[^\s<>\"'()\[\]]+", re.IGNORECASE)
_PASSWORD = re.compile(r"\b(?:şifre|parola|password|pass|pwd|pw)\b\s*[:=]", re.IGNORECASE)
_ARCHIVE_MENTION = re.compile(
    r"\.(?:zip|rar|7z)\b|\b(?:zip|rar|7z|archive|arşiv\w*|arsiv\w*)\b", re.IGNORECASE
)


def _is_own_release(host: str, path: str, repo: RepoRef | None) -> bool:
    """Only the scanned repo's own release downloads are exempt.

    Their files are covered by the API digest check. Any other GitHub-hosted
    URL (raw, gist, other repos' releases) is treated like an external one:
    attackers often host payloads on GitHub.
    """
    if repo is None or host not in {"github.com", "www.github.com"}:
        return False
    prefix = f"/{repo.owner}/{repo.repo}/releases/download/".lower()
    return path.lower().startswith(prefix)


@dataclass(frozen=True, kw_only=True)
class SuspiciousLinkRule(Rule):
    def hits(self, file: FileEntry, context: ScanContext) -> Iterator[Hit]:
        has_archive = bool(_ARCHIVE_MENTION.search(file.content))
        for lineno, segment in text.iter_scan_lines(file.content):
            note = self._check_line(segment, has_archive, context.repo)
            if note:
                yield Hit(line=lineno, text=segment, note=note)

    @staticmethod
    def _check_line(segment: str, has_archive: bool, repo: RepoRef | None) -> str | None:
        for m in _URL.finditer(segment):
            url = urlsplit(m.group().rstrip(".,;:!?"))
            host = (url.hostname or "").lower()
            if host in SHORTENERS:
                return "link shortener hides the real destination"
            if url.path.lower().endswith(ARCHIVE_EXTENSIONS) and not _is_own_release(
                host, url.path, repo
            ):
                return "download of an archive or executable"
        if has_archive and _PASSWORD.search(segment):
            return "password given for an archive (encrypted archives evade scanners)"
        return None


SUSPICIOUS_LINKS = SuspiciousLinkRule(
    id="GR-LINK-001",
    title="Suspicious download link in documentation",
    category="links",
    weight=20,
    applies_to=("*.md", "*.markdown", "*.rst", "*.adoc", "README*"),
    why=(
        "Malware repositories often point users to an executable or archive "
        "hosted outside GitHub, hide the link behind a shortener, or ship a "
        "password-protected archive so that scanners cannot look inside."
    ),
)

RULES = (SUSPICIOUS_LINKS,)
