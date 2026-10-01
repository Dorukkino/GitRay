"""Parse and validate the repository the user wants to scan."""

import re

from gitray.engine.errors import InvalidTarget
from gitray.engine.models import RepoRef

# GitHub logins: alphanumeric or single hyphens, max 39 chars, no leading hyphen.
_OWNER = r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})"
_REPO = r"[A-Za-z0-9._-]{1,100}"
_TARGET = re.compile(
    rf"^(?:(?:https?://)?(?:www\.)?github\.com/)?(?P<owner>{_OWNER})/(?P<repo>{_REPO})/?$",
    re.IGNORECASE,
)


def parse_target(raw: str) -> RepoRef:
    """Accept owner/repo, github.com/owner/repo or https://github.com/owner/repo."""
    text = raw.strip()
    m = _TARGET.match(text)
    if not m:
        raise InvalidTarget(f"not a GitHub repository: {text[:100]!r}")
    owner, repo = m.group("owner"), m.group("repo")
    if repo.lower().endswith(".git"):
        repo = repo[:-4]
    if not repo or repo in {".", ".."}:
        raise InvalidTarget(f"not a GitHub repository: {text[:100]!r}")
    return RepoRef(owner=owner, repo=repo)
