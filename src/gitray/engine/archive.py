"""Read a gzipped tarball from a byte stream, in memory, with hard limits.

Nothing is ever written to disk. The pipeline is:

    raw chunks -> count compressed bytes -> gunzip (bounded) -> count decompressed
    bytes -> tarfile "r|" (uncompressed stream mode)

Decompression is done here rather than by tarfile ("r|gz") so that every
decompressed byte, including content tarfile skips internally, passes through
our counter. This is what stops gzip bombs.
"""

import io
import tarfile
import zlib
from collections.abc import Buffer, Callable, Iterable, Iterator

from gitray.engine import text
from gitray.engine.errors import ArchiveError, LimitExceeded
from gitray.engine.limits import Limits
from gitray.engine.models import ArchiveStats, FileEntry

CHUNK = 64 * 1024
# wbits=31 selects the gzip container (16 + MAX_WBITS).
_GZIP_WBITS = 16 + zlib.MAX_WBITS


def count_bytes(
    chunks: Iterable[bytes],
    limit: int,
    limit_name: str,
    label: str,
    on_count: Callable[[int], None],
) -> Iterator[bytes]:
    total = 0
    for chunk in chunks:
        total += len(chunk)
        on_count(total)
        if total > limit:
            raise LimitExceeded(limit_name, limit, f"{label} exceeded {limit} bytes")
        yield chunk


def gunzip(chunks: Iterable[bytes], out_size: int = CHUNK) -> Iterator[bytes]:
    """Decompress gzip data, never producing more than out_size bytes per step."""
    d = zlib.decompressobj(_GZIP_WBITS)
    seen_input = False
    try:
        for chunk in chunks:
            data = chunk
            while data:
                seen_input = True
                if d.eof:
                    # Concatenated gzip member: continue with a fresh decompressor.
                    d = zlib.decompressobj(_GZIP_WBITS)
                out = d.decompress(data, out_size)
                if out:
                    yield out
                # Input held back by out_size, or the start of the next member.
                data = d.unused_data if d.eof else d.unconsumed_tail
    except zlib.error as e:
        raise ArchiveError(f"invalid gzip data: {e}") from e
    if not seen_input or not d.eof:
        raise ArchiveError("truncated or empty gzip stream")


class IterReader(io.RawIOBase):
    """Minimal read-only file object over an iterator of byte chunks."""

    def __init__(self, chunks: Iterable[bytes]) -> None:
        self._it = iter(chunks)
        self._buf = b""

    def readable(self) -> bool:
        return True

    def readinto(self, buffer: Buffer, /) -> int:
        while not self._buf:
            try:
                self._buf = next(self._it)
            except StopIteration:
                return 0
        view = memoryview(buffer).cast("B")
        n = min(len(view), len(self._buf))
        view[:n] = self._buf[:n]
        self._buf = self._buf[n:]
        return n


def _strip_root(name: str) -> str:
    # GitHub tarballs wrap everything in "<owner>-<repo>-<sha>/".
    parts = name.split("/", 1)
    return parts[1] if len(parts) == 2 else ""


class ArchiveReader:
    """Iterate the regular text files of a gzipped tarball as FileEntry objects.

    Raises LimitExceeded mid-iteration; entries yielded so far remain valid, so a
    caller may report a partial scan.
    """

    def __init__(self, chunks: Iterable[bytes], limits: Limits) -> None:
        self.limits = limits
        self.stats = ArchiveStats()
        compressed = count_bytes(
            chunks,
            limits.max_download_bytes,
            "max_download_bytes",
            "download size",
            self._on_download,
        )
        decompressed = count_bytes(
            gunzip(compressed),
            limits.max_total_bytes,
            "max_total_bytes",
            "decompressed size",
            self._on_decompress,
        )
        self._fileobj = io.BufferedReader(IterReader(decompressed), CHUNK)

    def _on_download(self, total: int) -> None:
        self.stats.downloaded_bytes = total

    def _on_decompress(self, total: int) -> None:
        self.stats.decompressed_bytes = total

    def __iter__(self) -> Iterator[FileEntry]:
        try:
            with tarfile.open(fileobj=self._fileobj, mode="r|") as tf:
                yield from self._entries(tf)
        except tarfile.TarError as e:
            raise ArchiveError(f"invalid tar data: {e}") from e

    def _entries(self, tf: tarfile.TarFile) -> Iterator[FileEntry]:
        limits, stats = self.limits, self.stats
        for member in tf:
            # Stream mode keeps every TarInfo; drop them to bound memory.
            tf.members = []  # type: ignore[attr-defined]
            stats.entries_seen += 1
            if stats.entries_seen > limits.max_files:
                raise LimitExceeded(
                    "max_files",
                    limits.max_files,
                    f"archive has more than {limits.max_files} entries",
                )
            # Symlinks, hardlinks, devices, FIFOs and directories are never read.
            if not member.isfile():
                if not member.isdir():
                    stats.skipped_non_regular += 1
                continue
            path = _strip_root(member.name)
            if not path:
                continue
            f = tf.extractfile(member)
            if f is None:
                stats.skipped_non_regular += 1
                continue
            data = f.read(limits.max_file_bytes + 1)
            truncated = len(data) > limits.max_file_bytes
            if truncated:
                data = data[: limits.max_file_bytes]
                stats.truncated_files += 1
            if text.is_binary(data):
                stats.skipped_binary += 1
                continue
            stats.files_scanned += 1
            yield FileEntry(path=path, content=text.decode(data), truncated=truncated)
