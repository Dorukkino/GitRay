"""GR-AUTO-*: files that run automatically on install or when a folder is opened."""

import json
import re
from collections.abc import Iterator
from dataclasses import dataclass

from gitray.engine.models import FileEntry, ScanContext
from gitray.engine.rules.base import Hit, RegexRule, Rule, compile_all

LIFECYCLE_SCRIPTS = (
    "preinstall",
    "install",
    "postinstall",
    "prepare",
    "preuninstall",
    "uninstall",
    "postuninstall",
)
_RISKY_SCRIPT = re.compile(
    r"\b(?:curl|wget|powershell|pwsh|iwr|irm)\b|https?://|\b(?:ba)?sh\s+-c\b|"
    r"\bnode\s+-e\b|\bpython[0-9.]*\s+-c\b|\beval\b|\bbase64\b|\|\s*(?:ba)?sh\b",
    re.IGNORECASE,
)


@dataclass(frozen=True, kw_only=True)
class PackageScriptsRule(Rule):
    escalated_weight: int

    def hits(self, file: FileEntry, context: ScanContext) -> Iterator[Hit]:
        try:
            data = json.loads(file.content)
        except ValueError:
            return
        scripts = data.get("scripts") if isinstance(data, dict) else None
        if not isinstance(scripts, dict):
            return
        lines = file.content.splitlines()
        for name in LIFECYCLE_SCRIPTS:
            command = scripts.get(name)
            if not isinstance(command, str):
                continue
            lineno, line = _find_key_line(lines, name)
            risky = bool(_RISKY_SCRIPT.search(command))
            yield Hit(
                line=lineno,
                text=line or f'"{name}": "{command}"',
                weight=self.escalated_weight if risky else None,
                note=f"'{name}' runs automatically on npm install"
                + ("; it uses network or shell commands" if risky else ""),
            )


def _find_key_line(lines: list[str], key: str) -> tuple[int, str]:
    pattern = re.compile(rf'"{re.escape(key)}"\s*:')
    for i, line in enumerate(lines, start=1):
        if pattern.search(line):
            return i, line
    return 1, ""


NPM_LIFECYCLE = PackageScriptsRule(
    id="GR-AUTO-001",
    title="package.json runs a script on install",
    category="autorun",
    weight=15,
    escalated_weight=35,
    applies_to=("package.json",),
    why=(
        "npm runs lifecycle scripts (preinstall, postinstall, ...) automatically "
        "during install, before you have used or reviewed the package. Malicious "
        "packages use them to run code on the developer's machine."
    ),
)

SETUP_PY = RegexRule(
    id="GR-AUTO-002",
    title="setup.py runs commands or uses the network",
    category="autorun",
    weight=30,
    applies_to=("setup.py",),
    why=(
        "setup.py is executed by pip during installation. Running processes, "
        "downloading data or evaluating code there means it runs on install."
    ),
    patterns=compile_all(
        r"\bsubprocess\b",
        r"\bos\.(?:system|popen|exec\w*|spawn\w*)\s*\(",
        r"\b(?:urllib\.request|urlopen|requests\.(?:get|post)|http\.client|socket\.socket)\b",
        r"\b(?:exec|eval)\s*\(",
        r"\b__import__\s*\(",
    ),
)

VSCODE_FOLDER_OPEN = RegexRule(
    id="GR-AUTO-003",
    title="VS Code task runs when the folder is opened",
    category="autorun",
    weight=35,
    applies_to=(".vscode/tasks.json",),
    why=(
        'A task with "runOn": "folderOpen" starts automatically when the '
        "repository is opened in VS Code (once the workspace is trusted). This is "
        "a known way to run code on a developer's machine."
    ),
    patterns=compile_all(r"[\"']runOn[\"']\s*:\s*[\"']folderOpen[\"']"),
)

RULES = (NPM_LIFECYCLE, SETUP_PY, VSCODE_FOLDER_OPEN)
