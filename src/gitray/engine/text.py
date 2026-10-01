"""Helpers for handling untrusted text from scanned repositories."""

import math
import re
from collections import Counter
from collections.abc import Iterator
from pathlib import PurePosixPath

# Long lines are scanned in overlapping windows so regexes stay fast on minified files.
SCAN_WINDOW = 10_000
SCAN_OVERLAP = 1_000
SNIPPET_MAX = 200
BINARY_SNIFF_BYTES = 8192

DOC_SUFFIXES = frozenset({".md", ".markdown", ".rst", ".adoc"})
DOC_TXT_NAMES = frozenset(
    {
        "readme.txt",
        "changelog.txt",
        "changes.txt",
        "history.txt",
        "license.txt",
        "copying.txt",
        "contributing.txt",
        "authors.txt",
        "notice.txt",
    }
)

# C0/C1 control characters (except tab), DEL, and bidi overrides used in "trojan source".
_UNSAFE_CHARS = re.compile(r"[\x00-\x08\x0a-\x1f\x7f-\x9f\u200e\u200f\u202a-\u202e\u2066-\u2069]")
_URL = re.compile(r"(?i)\b(h)tt(ps?)://([^\s/?#'\"<>]+)")
_FTP = re.compile(r"(?i)\bftp://")


def is_binary(data: bytes) -> bool:
    return b"\x00" in data[:BINARY_SNIFF_BYTES]


def decode(data: bytes) -> str:
    return data.decode("utf-8", errors="replace")


def is_doc_path(path: str) -> bool:
    """True for documentation files. Decided by file type only, never by directory."""
    p = PurePosixPath(path)
    if p.suffix.lower() in DOC_SUFFIXES:
        return True
    return p.name.lower() in DOC_TXT_NAMES


def split_lines(content: str) -> list[str]:
    """Split on \\n and \\r\\n only, like editors and GitHub number lines.

    str.splitlines() would also break on \\x0b, \\x0c, \\x85, U+2028 and others,
    shifting reported line numbers.
    """
    lines = content.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    return [line.removesuffix("\r") for line in lines]


def iter_scan_lines(content: str) -> Iterator[tuple[int, str]]:
    """Yield (1-based line number, segment). Long lines yield overlapping windows."""
    for lineno, line in enumerate(split_lines(content), start=1):
        if len(line) <= SCAN_WINDOW:
            yield lineno, line
            continue
        step = SCAN_WINDOW - SCAN_OVERLAP
        for start in range(0, len(line), step):
            yield lineno, line[start : start + SCAN_WINDOW]
            if start + SCAN_WINDOW >= len(line):
                break


def shannon_entropy(s: str) -> float:
    if not s:
        return 0.0
    n = len(s)
    return -sum(c / n * math.log2(c / n) for c in Counter(s).values())


def snippet(line: str, max_len: int = SNIPPET_MAX) -> str:
    line = line.strip()
    if len(line) > max_len:
        return line[: max_len - 1] + "…"
    return line


def defang(s: str) -> str:
    """Make URLs non-clickable: https://evil.example/x -> hxxps://evil[.]example/x."""

    def repl(m: re.Match[str]) -> str:
        return f"{m.group(1)}xx{m.group(2)}://{m.group(3).replace('.', '[.]')}"

    return _FTP.sub("fxp://", _URL.sub(repl, s))


def sanitize(s: str, max_len: int = SNIPPET_MAX) -> str:
    """Make untrusted text safe for a terminal or JSON consumer.

    Removes control and bidi characters (terminal escape injection), replaces lone
    surrogates from undecodable file names, defangs URLs and truncates.
    """
    s = s.encode("utf-8", errors="replace").decode("utf-8")
    s = _UNSAFE_CHARS.sub("?", s)
    s = defang(s)
    if len(s) > max_len:
        s = s[: max_len - 1] + "…"
    return s
