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


# Static data-flow analysis of setup.py (engine/pyflow.py). Files over these limits
# fall back to regexes and, when they can run processes, count as suspicious.
MAX_AST_SOURCE_CHARS = 256 * 1024
# Passes over the file until values stop changing.
MAX_FLOW_ITERATIONS = 20
# A value that keeps changing (e.g. s = s + "x") is widened after this many changes.
MAX_FLOW_CHANGES = 4
# Distinct strings kept per value, and their length, before widening.
MAX_FLOW_VALUES = 32
MAX_FLOW_STRING_CHARS = 4096
# Names (e.g. "subprocess.run") a variable may refer to.
MAX_FLOW_QUALS = 64
# exec("...") of a constant string is analysed as code, this many levels deep.
MAX_NESTED_EXEC_DEPTH = 2
