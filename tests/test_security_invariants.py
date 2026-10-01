"""GitRay's own code must never run, write or extract anything from a scanned repo."""

import ast
from pathlib import Path

import pytest

SRC = Path(__file__).parent.parent / "src" / "gitray"

FORBIDDEN_MODULES = {
    "subprocess",
    "pickle",
    "marshal",
    "shelve",
    "importlib",
    "ctypes",
    "multiprocessing",
    "tempfile",
    "shutil",
    "pty",
}
FORBIDDEN_CALLS = {"eval", "exec", "compile", "__import__", "open", "breakpoint"}
FORBIDDEN_ATTR_CALLS = {
    "system",
    "popen",
    "spawnl",
    "spawnv",
    "execv",
    "execve",
    "execl",
    "startfile",
    "extract",
    "extractall",
    "write_text",
    "write_bytes",
    "mkdir",
    "unlink",
}


def violations(source: str) -> list[str]:
    found = []
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Import):
            found += [a.name for a in node.names if a.name.split(".")[0] in FORBIDDEN_MODULES]
        elif isinstance(node, ast.ImportFrom) and node.module:
            if node.module.split(".")[0] in FORBIDDEN_MODULES:
                found.append(node.module)
        elif isinstance(node, ast.Call):
            fn = node.func
            if isinstance(fn, ast.Name) and fn.id in FORBIDDEN_CALLS:
                found.append(f"{fn.id}()")
            elif isinstance(fn, ast.Attribute) and fn.attr in FORBIDDEN_ATTR_CALLS:
                found.append(f".{fn.attr}()")
    return found


SOURCES = sorted(SRC.rglob("*.py"))


@pytest.mark.parametrize("path", SOURCES, ids=lambda p: str(p.relative_to(SRC)))
def test_no_forbidden_apis(path: Path) -> None:
    assert violations(path.read_text(encoding="utf-8")) == []


def test_checker_catches_violations() -> None:
    sample = (
        "import subprocess\nfrom pickle import loads\nexec('x')\n"
        "tf.extractall('/tmp')\nos.system('ls')\nopen('f', 'w')\n"
    )
    assert len(violations(sample)) == 6


def test_sources_found() -> None:
    assert len(SOURCES) > 10


BIDI_AND_INVISIBLE = {0x200B, 0x200E, 0x200F, *range(0x202A, 0x202F), *range(0x2066, 0x206A)}


@pytest.mark.parametrize(
    "path",
    sorted([*SRC.rglob("*.py"), *(SRC.parent.parent / "tests").rglob("*.py")]),
    ids=lambda p: p.name,
)
def test_no_literal_bidi_characters_in_our_code(path: Path) -> None:
    # Such characters must be written as escapes (\\u202e) so code reads as it runs.
    assert not [c for c in path.read_text(encoding="utf-8") if ord(c) in BIDI_AND_INVISIBLE]
