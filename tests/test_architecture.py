"""The engine must stay a pure package: no imports from web, worker, CLI or their stacks."""

import ast
from pathlib import Path

import pytest

ENGINE = Path(__file__).parent.parent / "src" / "gitray" / "engine"

FORBIDDEN_PREFIXES = (
    "gitray.web",
    "gitray.worker",
    "gitray.cli",
    "fastapi",
    "jinja2",
    "psycopg",
    "sqlalchemy",
)


def _resolve_relative(module: str | None, level: int, package: str) -> str:
    base = package.split(".")
    if level > len(base):
        return "<outside>"
    parent = base[: len(base) - level + 1]
    return ".".join(parent + ([module] if module else []))


def bad_imports(source: str, package: str) -> list[str]:
    """Return forbidden imports. `package` is the importing module's package, e.g. gitray.engine."""
    found = []
    for node in ast.walk(ast.parse(source)):
        names: list[str] = []
        if isinstance(node, ast.Import):
            names = [a.name for a in node.names]
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                mod = _resolve_relative(node.module, node.level, package)
                if not mod.startswith("gitray.engine"):
                    # e.g. "from .. import cli" leaves the engine package.
                    found.append(f"{'.' * node.level}{node.module or ''} -> {mod}")
                    continue
                names = [mod]
            else:
                names = [node.module or ""]
                names += [f"{node.module}.{a.name}" for a in node.names]
        found += [n for n in names if n.startswith(FORBIDDEN_PREFIXES)]
    return found


def _package_of(path: Path) -> str:
    rel = path.relative_to(ENGINE.parent.parent).with_suffix("")
    parts = list(rel.parts)
    if parts[-1] == "__init__":
        parts.pop()
    else:
        parts = parts[:-1]
    return ".".join(parts)


ENGINE_FILES = sorted(ENGINE.rglob("*.py"))


@pytest.mark.parametrize("path", ENGINE_FILES, ids=lambda p: str(p.relative_to(ENGINE)))
def test_engine_does_not_import_outer_layers(path: Path) -> None:
    assert bad_imports(path.read_text(encoding="utf-8"), _package_of(path)) == []


@pytest.mark.parametrize(
    "source",
    [
        "import gitray.cli",
        "from gitray.web import app",
        "from gitray import worker",
        "from gitray import cli",
        "from ... import cli",
        "from ...web import app",
        "import fastapi",
        "from jinja2 import Template",
        "import psycopg",
        "from sqlalchemy.orm import Session",
    ],
)
def test_checker_catches_violations(source: str) -> None:
    assert bad_imports(source, "gitray.engine.rules") != []


@pytest.mark.parametrize(
    "source",
    ["from gitray.engine import text", "from . import base", "from .. import text", "import re"],
)
def test_checker_allows_engine_imports(source: str) -> None:
    assert bad_imports(source, "gitray.engine.rules") == []


def test_engine_files_found() -> None:
    assert len(ENGINE_FILES) > 10
