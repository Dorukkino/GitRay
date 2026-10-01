import gzip
import zlib

import pytest

from gitray.engine import ArchiveError, LimitExceeded, Limits
from gitray.engine.archive import ArchiveReader, gunzip
from gitray.engine.limits import MiB
from tests.conftest import TarBuilder, chunked, make_tarball


def read_all(data: bytes, limits: Limits | None = None) -> tuple[list, ArchiveReader]:
    reader = ArchiveReader(chunked(data), limits or Limits())
    return list(reader), reader


def test_reads_regular_files_and_strips_root() -> None:
    entries, reader = read_all(make_tarball({"a.py": "print(1)\n", "dir/b.md": "# hi\n"}))
    assert [(e.path, e.content) for e in entries] == [
        ("a.py", "print(1)\n"),
        ("dir/b.md", "# hi\n"),
    ]
    assert reader.stats.files_scanned == 2


def test_skips_symlinks_hardlinks_and_special_files() -> None:
    data = (
        TarBuilder()
        .file("real.txt", "hello")
        .symlink("link", "/etc/passwd")
        .hardlink("hard", "real.txt")
        .fifo("pipe")
        .build()
    )
    entries, reader = read_all(data)
    assert [e.path for e in entries] == ["real.txt"]
    assert reader.stats.skipped_non_regular == 3


def test_path_traversal_names_are_only_reported_never_written() -> None:
    entries, _ = read_all(make_tarball({"../../evil.sh": "echo hi"}))
    assert entries[0].path == "../../evil.sh"


def test_binary_files_skipped() -> None:
    entries, reader = read_all(make_tarball({"img.bin": b"\x89PNG\x00\x01", "a.txt": "x"}))
    assert [e.path for e in entries] == ["a.txt"]
    assert reader.stats.skipped_binary == 1


def test_large_file_is_truncated() -> None:
    limits = Limits(max_file_bytes=10)
    entries, reader = read_all(make_tarball({"big.txt": "0123456789ABCDEF", "x": "y"}), limits)
    assert entries[0].content == "0123456789"
    assert entries[0].truncated
    assert entries[1].path == "x"
    assert reader.stats.truncated_files == 1


def test_too_many_entries() -> None:
    data = make_tarball({f"f{i}.txt": "x" for i in range(20)})
    with pytest.raises(LimitExceeded, match="entries") as exc:
        read_all(data, Limits(max_files=10))
    assert (exc.value.limit, exc.value.value) == ("max_files", 10)


def test_download_limit() -> None:
    data = make_tarball({f"f{i}.txt": str(i) * 5000 for i in range(50)})
    with pytest.raises(LimitExceeded, match="download") as exc:
        read_all(data, Limits(max_download_bytes=len(data) // 2))
    assert exc.value.limit == "max_download_bytes"


def test_gzip_bomb_stops_at_decompressed_limit() -> None:
    # ~64 MiB of zeros compresses to ~64 KiB (ratio ~1000:1).
    bomb = TarBuilder().zeros("bomb.txt", 64 * MiB).build()
    assert len(bomb) < 200 * 1024
    limit = 8 * MiB
    reader = ArchiveReader(chunked(bomb), Limits(max_total_bytes=limit))
    with pytest.raises(LimitExceeded, match="decompressed") as exc:
        list(reader)
    assert (exc.value.limit, exc.value.value) == ("max_total_bytes", limit)
    # Reading stops as soon as the counter passes the limit (plus one chunk).
    assert limit < reader.stats.decompressed_bytes <= limit + 64 * 1024


def test_gzip_bomb_inside_skipped_member_is_counted() -> None:
    # The bomb is a member whose content tarfile skips internally: it follows a
    # symlink and exceeds max_file_bytes, so we read only its first bytes.
    bomb = (
        TarBuilder()
        .symlink("link", "target")
        .zeros("skipped-bomb.bin", 64 * MiB)
        .file("after.txt", "never reached")
        .build()
    )
    limits = Limits(max_total_bytes=8 * MiB, max_file_bytes=1024)
    reader = ArchiveReader(chunked(bomb), limits)
    seen: list[str] = []
    with pytest.raises(LimitExceeded, match="decompressed"):
        for entry in reader:
            seen.append(entry.path)
    assert "after.txt" not in seen
    assert reader.stats.decompressed_bytes <= 8 * MiB + 64 * 1024


def test_gunzip_bounds_output_per_step() -> None:
    payload = gzip.compress(bytes(10 * MiB))
    sizes = [len(c) for c in gunzip([payload], out_size=4096)]
    assert max(sizes) <= 4096
    assert sum(sizes) == 10 * MiB


def test_gunzip_handles_concatenated_members() -> None:
    data = gzip.compress(b"hello ") + gzip.compress(b"world")
    assert b"".join(gunzip(chunked(data, 7))) == b"hello world"


@pytest.mark.parametrize(
    "data",
    [b"", b"not gzip at all", gzip.compress(b"x" * 1000)[:-20]],
    ids=["empty", "garbage", "truncated"],
)
def test_invalid_gzip(data: bytes) -> None:
    with pytest.raises(ArchiveError):
        list(gunzip([data]))


def test_invalid_tar_inside_gzip() -> None:
    with pytest.raises(ArchiveError):
        read_all(gzip.compress(b"x" * 2000))


def test_zlib_raw_deflate_is_rejected() -> None:
    with pytest.raises(ArchiveError):
        list(gunzip([zlib.compress(b"abc")]))
