"""Minimal GitHub API client: repository metadata and the tarball byte stream.

Release assets are never downloaded; only their API-provided digest is read.
"""

import re
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any
from urllib.parse import quote, urljoin, urlsplit

import httpx

from gitray import __version__
from gitray.engine.errors import GitHubError, LimitExceeded
from gitray.engine.limits import Limits
from gitray.engine.models import ReleaseAsset, RepoInfo, RepoRef

API_URL = "https://api.github.com"
TARBALL_HOSTS = frozenset({"api.github.com", "codeload.github.com"})
STREAM_CHUNK = 64 * 1024
MAX_RELEASES = 10
MAX_API_REDIRECTS = 3
REDIRECT_CODES = frozenset({301, 302, 303, 307, 308})
_SHA = re.compile(r"^[0-9a-f]{40}$")
_FULL_NAME = re.compile(r"^[A-Za-z0-9-]{1,39}/[A-Za-z0-9._-]{1,100}$")
_TIMEOUT = httpx.Timeout(10.0, read=30.0)


class GitHubClient:
    def __init__(
        self,
        token: str | None = None,
        *,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": f"gitray/{__version__}",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"
        self._client = httpx.Client(
            base_url=API_URL,
            headers=headers,
            timeout=_TIMEOUT,
            follow_redirects=False,
            transport=transport,
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "GitHubClient":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def _get(self, path: str, *, accept: str | None = None) -> httpx.Response:
        """GET from the API, following redirects (moved or renamed repos) only within it."""
        headers = {"Accept": accept} if accept else None
        url = path
        for _ in range(MAX_API_REDIRECTS + 1):
            try:
                resp = self._client.get(url, headers=headers)
            except httpx.HTTPError as e:
                raise GitHubError(f"request to GitHub failed: {type(e).__name__}") from e
            if resp.status_code not in REDIRECT_CODES:
                _raise_for_status(resp)
                return resp
            url = _api_redirect_target(str(resp.url), resp.headers.get("Location", ""))
        raise GitHubError("repository moved or renamed: too many redirects")

    def _get_json(self, path: str) -> Any:
        resp = self._get(path)
        try:
            return resp.json()
        except ValueError as e:
            raise GitHubError(f"invalid JSON from GitHub for {path}") from e

    def fetch_repo_info(self, ref: RepoRef) -> RepoInfo:
        repo = self._get_json(f"/repos/{ref.owner}/{ref.repo}")
        if not isinstance(repo, dict):
            raise GitHubError("unexpected repository response")
        if repo.get("private"):
            raise GitHubError("only public repositories can be scanned")
        try:
            full_name = str(repo["full_name"])
            size_kb = int(repo["size"])
            created_at = str(repo["created_at"])
            pushed_at = repo.get("pushed_at")
            default_branch = str(repo["default_branch"])
            owner_login = str(repo["owner"]["login"])
            owner_type = str(repo["owner"].get("type", ""))
        except (KeyError, TypeError, ValueError, AttributeError) as e:
            raise GitHubError("unexpected repository response") from e
        if not _FULL_NAME.match(full_name):
            raise GitHubError("unexpected repository name from GitHub")
        # Use the canonical name: the requested one may be an old (renamed) name.
        base = f"/repos/{full_name}"

        sha = self._get(
            f"{base}/commits/{quote(default_branch, safe='/')}", accept="application/vnd.github.sha"
        ).text.strip()
        if not _SHA.match(sha):
            raise GitHubError("unexpected commit SHA from GitHub")

        return RepoInfo(
            full_name=full_name,
            size_kb=size_kb,
            created_at=created_at,
            pushed_at=str(pushed_at) if pushed_at else None,
            default_branch=default_branch,
            head_sha=sha,
            owner_login=owner_login,
            owner_type=owner_type,
            owner_created_at=self._owner_created_at(owner_login),
            release_assets=self._release_assets(base),
        )

    def _owner_created_at(self, login: str) -> str | None:
        try:
            user = self._get_json(f"/users/{login}")
        except GitHubError:
            return None
        value = user.get("created_at") if isinstance(user, dict) else None
        return str(value) if value else None

    def _release_assets(self, base: str) -> tuple[ReleaseAsset, ...]:
        releases = self._get_json(f"{base}/releases?per_page={MAX_RELEASES}")
        if not isinstance(releases, list):
            raise GitHubError("unexpected releases response")
        assets: list[ReleaseAsset] = []
        for rel in releases:
            if not isinstance(rel, dict):
                continue
            tag = str(rel.get("tag_name", ""))
            for a in rel.get("assets") or []:
                if not isinstance(a, dict):
                    continue
                digest = a.get("digest")
                assets.append(
                    ReleaseAsset(
                        release_tag=tag,
                        name=str(a.get("name", "")),
                        size=int(a.get("size") or 0),
                        digest=str(digest) if digest else None,
                    )
                )
        return tuple(assets)

    @contextmanager
    def stream_tarball(self, ref: RepoRef, sha: str, limits: Limits) -> Iterator[Iterator[bytes]]:
        """Yield an iterator of raw (still gzipped) tarball chunks."""
        if not _SHA.match(sha):
            raise GitHubError("invalid commit SHA")
        path = f"/repos/{ref.owner}/{ref.repo}/tarball/{sha}"
        try:
            resp = self._client.send(self._client.build_request("GET", path), stream=True)
        except httpx.HTTPError as e:
            raise GitHubError(f"tarball request failed: {type(e).__name__}") from e
        try:
            if resp.status_code in REDIRECT_CODES:
                location = resp.headers.get("Location", "")
                resp.close()
                resp = self._open_redirect(location)
            _raise_for_status(resp)
            length = resp.headers.get("Content-Length")
            if length and length.isdigit() and int(length) > limits.max_download_bytes:
                raise LimitExceeded(
                    "max_download_bytes",
                    limits.max_download_bytes,
                    f"download size exceeded {limits.max_download_bytes} bytes",
                )
            yield _iter_raw(resp)
        finally:
            resp.close()

    def _open_redirect(self, location: str) -> httpx.Response:
        url = urlsplit(location)
        if url.scheme != "https" or url.hostname not in TARBALL_HOSTS:
            raise GitHubError("tarball redirect to an unexpected host")
        request = self._client.build_request("GET", location)
        # The token is only meant for api.github.com.
        if url.hostname != "api.github.com":
            request.headers.pop("Authorization", None)
        try:
            return self._client.send(request, stream=True)
        except httpx.HTTPError as e:
            raise GitHubError(f"tarball download failed: {type(e).__name__}") from e


def _api_redirect_target(current: str, location: str) -> str:
    target = urlsplit(urljoin(current, location)) if location else None
    if target is None or target.scheme != "https" or target.hostname != "api.github.com":
        raise GitHubError(
            "repository moved or renamed, and GitHub redirected outside api.github.com; "
            "check the repository's new address"
        )
    return target.geturl()


def _iter_raw(resp: httpx.Response) -> Iterator[bytes]:
    try:
        yield from resp.iter_raw(STREAM_CHUNK)
    except httpx.HTTPError as e:
        raise GitHubError(f"tarball download failed: {type(e).__name__}") from e


def _raise_for_status(resp: httpx.Response) -> None:
    if resp.is_success:
        return
    if resp.status_code == 404:
        raise GitHubError("repository not found (or not public)")
    if resp.status_code in (403, 429) and resp.headers.get("x-ratelimit-remaining") == "0":
        raise GitHubError("GitHub API rate limit reached; set GITHUB_TOKEN or try later")
    raise GitHubError(f"GitHub API returned HTTP {resp.status_code}")
