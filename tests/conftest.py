"""Shared test helpers: in-memory tarball builder and a fake GitHub API."""

import io
import json
import tarfile
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from typing import Any

import httpx
import pytest

ROOT = "octo-demo-0123456789abcdef0123456789abcdef01234567/"
SHA = "0123456789abcdef0123456789abcdef01234567"


class ZeroReader(io.RawIOBase):
    """Produces `size` zero bytes without allocating them up front."""

    def __init__(self, size: int) -> None:
        self.remaining = size

    def readable(self) -> bool:
        return True

    def readinto(self, b: Any) -> int:
        n = min(len(b), self.remaining)
        b[:n] = bytes(n)
        self.remaining -= n
        return n


class TarBuilder:
    """Builds a gzipped tarball in memory, mimicking GitHub's "<root>/" prefix."""

    def __init__(self, root: str = ROOT) -> None:
        self.root = root
        self._buf = io.BytesIO()
        self._tf = tarfile.open(fileobj=self._buf, mode="w|gz")  # noqa: SIM115 closed in build()
        self._tf.addfile(self._info(self.root.rstrip("/"), tarfile.DIRTYPE))

    def _info(self, name: str, kind: bytes, size: int = 0) -> tarfile.TarInfo:
        info = tarfile.TarInfo(name)
        info.type = kind
        info.size = size
        info.mode = 0o644
        return info

    def file(self, path: str, content: str | bytes) -> "TarBuilder":
        data = content.encode() if isinstance(content, str) else content
        self._tf.addfile(self._info(self.root + path, tarfile.REGTYPE, len(data)), io.BytesIO(data))
        return self

    def zeros(self, path: str, size: int) -> "TarBuilder":
        self._tf.addfile(self._info(self.root + path, tarfile.REGTYPE, size), ZeroReader(size))
        return self

    def symlink(self, path: str, target: str) -> "TarBuilder":
        info = self._info(self.root + path, tarfile.SYMTYPE)
        info.linkname = target
        self._tf.addfile(info)
        return self

    def hardlink(self, path: str, target: str) -> "TarBuilder":
        info = self._info(self.root + path, tarfile.LNKTYPE)
        info.linkname = self.root + target
        self._tf.addfile(info)
        return self

    def fifo(self, path: str) -> "TarBuilder":
        self._tf.addfile(self._info(self.root + path, tarfile.FIFOTYPE))
        return self

    def build(self) -> bytes:
        self._tf.close()
        return self._buf.getvalue()


def chunked(data: bytes, size: int = 64 * 1024) -> Iterator[bytes]:
    for i in range(0, len(data), size):
        yield data[i : i + size]


def make_tarball(files: dict[str, str | bytes]) -> bytes:
    b = TarBuilder()
    for path, content in files.items():
        b.file(path, content)
    return b.build()


@dataclass
class FakeGitHub:
    """httpx MockTransport handler that imitates the GitHub endpoints we use."""

    tarball: bytes = field(default_factory=lambda: make_tarball({"README.md": "# demo\n"}))
    repo: dict[str, Any] = field(
        default_factory=lambda: {
            "full_name": "octo/demo",
            "size": 10,
            "created_at": "2020-01-01T00:00:00Z",
            "pushed_at": "2024-01-01T00:00:00Z",
            "default_branch": "main",
            "private": False,
            "owner": {"login": "octo", "type": "User"},
        }
    )
    releases: list[dict[str, Any]] = field(default_factory=list)
    redirect_to: str = f"https://codeload.github.com/octo/demo/legacy.tar.gz/{SHA}"
    requests: list[httpx.Request] = field(default_factory=list)
    overrides: dict[str, Callable[[httpx.Request], httpx.Response]] = field(default_factory=dict)

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        path = request.url.path
        if path in self.overrides:
            return self.overrides[path](request)
        host = request.url.host
        if host == "codeload.github.com":
            # An iterator body is streamed like a real download (bytes would be pre-read).
            return httpx.Response(200, content=chunked(self.tarball))
        if path == "/repos/octo/demo":
            return httpx.Response(200, json=self.repo)
        if path.startswith("/repos/octo/demo/commits/"):
            return httpx.Response(200, text=SHA)
        if path == "/users/octo":
            return httpx.Response(200, json={"created_at": "2015-05-05T00:00:00Z"})
        if path == "/repos/octo/demo/releases":
            return httpx.Response(200, json=self.releases)
        if path == f"/repos/octo/demo/tarball/{SHA}":
            return httpx.Response(302, headers={"Location": self.redirect_to})
        return httpx.Response(404, json={"message": "Not Found"})

    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self)


@pytest.fixture
def fake_github() -> FakeGitHub:
    return FakeGitHub()


def dumps(obj: Any) -> str:
    return json.dumps(obj, indent=2)
