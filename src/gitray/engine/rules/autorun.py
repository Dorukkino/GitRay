"""GR-AUTO-*: files that run automatically on install or when a folder is opened."""

import json
import re
from collections.abc import Iterator
from dataclasses import dataclass

from gitray.engine import text
from gitray.engine.models import FileEntry, ScanContext
from gitray.engine.rules.base import Hit, RegexRule, Rule, compile_all

LIFECYCLE_SCRIPTS = (
    # npm still runs prepublish on a local "npm install".
    "prepublish",
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
        lines = text.split_lines(file.content)
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

_SETUP_NETWORK = compile_all(
    r"\b(?:urllib\.request|urlopen|requests\.(?:get|post)|http\.client|socket\.socket)\b",
)
_SETUP_PROCESS = compile_all(
    r"\bsubprocess\.\w+",
    r"\bos\.(?:system|popen|exec\w*|spawn\w*)\s*\(",
)
# A URL or download tool on the same line turns a process call into a download.
_SETUP_DOWNLOAD = re.compile(
    r"https?://|\b(?:curl|wget|powershell|pwsh|invoke-webrequest|invoke-restmethod|iwr|irm)\b",
    re.IGNORECASE,
)
_SETUP_DYNAMIC_CODE = compile_all(r"\b(?:exec|eval)\s*\(", r"\b__import__\s*\(")
_SETUP_DECODE = re.compile(
    r"\b(?:b64decode|b32decode|b85decode|a85decode|decompress|fromhex|unhexlify|"
    r"decodebytes|codecs\.decode)\b"
)
_IMPORT_ONLY = re.compile(r"^\s*(?:import\s|from\s+\S+\s+import\s)")


@dataclass(frozen=True, kw_only=True)
class SetupPyRule(Rule):
    """Running a process (e.g. reading the compiler version) or exec() (e.g.
    reading __version__) is common in builds. Network use, a process that
    downloads, or executing decoded data makes it an install-time payload."""

    escalated_weight: int

    def hits(self, file: FileEntry, context: ScanContext) -> Iterator[Hit]:
        decodes = bool(_SETUP_DECODE.search(file.content))
        last_line = 0
        for lineno, segment in text.iter_scan_lines(file.content):
            # Only calls are reported; a bare import does nothing by itself.
            if lineno == last_line or _IMPORT_ONLY.match(segment):
                continue
            hit = self._classify(segment, decodes)
            if hit is None:
                continue
            note, weight = hit
            last_line = lineno
            yield Hit(line=lineno, text=segment, weight=weight, note=note)

    def _classify(self, segment: str, decodes: bool) -> tuple[str, int | None] | None:
        if any(p.search(segment) for p in _SETUP_NETWORK):
            return "uses the network during install", self.escalated_weight
        if any(p.search(segment) for p in _SETUP_PROCESS):
            if _SETUP_DOWNLOAD.search(segment):
                return "runs a process that downloads during install", self.escalated_weight
            return "runs a process during install", None
        if any(p.search(segment) for p in _SETUP_DYNAMIC_CODE):
            if decodes:
                return "executes decoded data during install", self.escalated_weight
            return "executes dynamic code during install", None
        return None


SETUP_PY = SetupPyRule(
    id="GR-AUTO-002",
    title="setup.py runs code, commands or uses the network",
    category="autorun",
    weight=10,
    escalated_weight=35,
    applies_to=("setup.py",),
    why=(
        "setup.py is executed by pip during installation. Downloading data, "
        "running download tools or evaluating decoded code there means a payload "
        "runs on install. Plain build commands are common and weigh little."
    ),
)

VSCODE_FOLDER_OPEN = RegexRule(
    id="GR-AUTO-003",
    title="VS Code task runs when the folder is opened",
    category="autorun",
    weight=35,
    # Workspace files can define the same tasks under "tasks".
    applies_to=(".vscode/tasks.json", "*.code-workspace"),
    why=(
        'A task with "runOn": "folderOpen" starts automatically when the '
        "repository is opened in VS Code (once the workspace is trusted). This is "
        "a known way to run code on a developer's machine."
    ),
    patterns=compile_all(r"[\"']runOn[\"']\s*:\s*[\"']folderOpen[\"']"),
)

RULES = (NPM_LIFECYCLE, SETUP_PY, VSCODE_FOLDER_OPEN)
