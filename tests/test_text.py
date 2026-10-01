import pytest

from gitray.engine import text


@pytest.mark.parametrize(
    "path",
    [
        "README.md",
        "docs/guide.rst",
        "x.adoc",
        "notes.markdown",
        "README.txt",
        "readme.TXT",
        "sub/LICENSE.txt",
        "CHANGELOG.txt",
        "CONTRIBUTING.txt",
    ],
)
def test_doc_paths(path: str) -> None:
    assert text.is_doc_path(path)


@pytest.mark.parametrize(
    "path",
    [
        "notes.txt",
        "requirements.txt",
        "docs/notes.txt",
        "docs/assets/app.js",
        "docs/install.sh",
        "docs/build.py",
        "doc/setup.ps1",
        "docs/index.html",
        "install.sh",
        "README",
    ],
)
def test_non_doc_paths(path: str) -> None:
    assert not text.is_doc_path(path)


def test_defang() -> None:
    assert (
        text.defang("see https://evil.example.com/a.zip")
        == "see hxxps://evil[.]example[.]com/a.zip"
    )
    assert text.defang("HTTP://x.y") == "HxxP://x[.]y"
    assert text.defang("ftp://x.y") == "fxp://x.y"


def test_sanitize_strips_terminal_escapes_and_bidi() -> None:
    s = text.sanitize("ok\x1b[31mred\x07\u202eevil\r\nnext")
    assert "\x1b" not in s and "\x07" not in s and "\u202e" not in s
    assert "\r" not in s and "\n" not in s
    assert s.startswith("ok?[31mred")


def test_sanitize_handles_surrogates_and_truncates() -> None:
    s = text.sanitize("name\udcff" + "a" * 500)
    s.encode("utf-8")  # must not raise
    assert len(s) == text.SNIPPET_MAX
    assert s.endswith("…")


def test_binary_detection() -> None:
    assert text.is_binary(b"abc\x00def")
    assert not text.is_binary("plain ünïcode".encode())


def test_long_lines_are_windowed() -> None:
    line = "a" * 25_000
    windows = list(text.iter_scan_lines(line + "\nshort"))
    assert all(len(seg) <= text.SCAN_WINDOW for _, seg in windows)
    assert windows[-1] == (2, "short")
    covered = sum(len(seg) for n, seg in windows if n == 1)
    assert covered >= 25_000


def test_entropy() -> None:
    assert text.shannon_entropy("") == 0
    assert text.shannon_entropy("aaaa") == 0
    assert text.shannon_entropy("0123456789abcdef") == pytest.approx(4.0)
