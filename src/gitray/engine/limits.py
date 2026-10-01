"""Safety limits for reading untrusted repositories. All defaults live here."""

from dataclasses import dataclass

MiB = 1024 * 1024


@dataclass(frozen=True, kw_only=True)
class Limits:
    # Repository size reported by the GitHub API (KB, includes history; approximate).
    max_repo_size_kb: int = 512_000
    # Compressed bytes downloaded from codeload.
    max_download_bytes: int = 50 * MiB
    # Tar entries of any type (files, dirs, links), bounds memory used by tarfile.
    max_files: int = 20_000
    # Bytes read per regular file; the rest is skipped and the file marked truncated.
    max_file_bytes: int = 1 * MiB
    # Decompressed bytes flowing through the tar reader, including skipped content.
    max_total_bytes: int = 200 * MiB
