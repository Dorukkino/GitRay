"""Exceptions raised by the scan engine."""


class GitRayError(Exception):
    """Base class for all expected engine errors."""


class InvalidTarget(GitRayError):
    """The user-supplied repository reference is not a valid GitHub repo."""


class LimitExceeded(GitRayError):
    """A safety limit (size, file count, bytes) was exceeded."""


class ArchiveError(GitRayError):
    """The tarball is corrupt or cannot be read."""


class GitHubError(GitRayError):
    """The GitHub API returned an error or an unexpected response."""
