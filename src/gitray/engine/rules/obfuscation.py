"""GR-OBF-*: obfuscated or packed content."""

import re
from collections.abc import Iterator
from dataclasses import dataclass

from gitray.engine import text
from gitray.engine.models import FileEntry
from gitray.engine.rules.base import Hit, Rule

MIN_TOKEN = 200
# Random base64 tends to ~5.8 bits/char (max 6.0); random hex to ~3.9 (max 4.0).
BASE64_ENTROPY = 5.0
HEX_ENTROPY = 3.5
MIN_HEX_ESCAPES = 50

# Embedded images are legitimate in README, HTML, CSS and SVG files.
_DATA_IMAGE = re.compile(r"data:image/[\w.+-]+;base64,[A-Za-z0-9+/=]+", re.IGNORECASE)
_TOKEN = re.compile(rf"[A-Za-z0-9+/=_-]{{{MIN_TOKEN},}}")
_HEX_RUN = re.compile(rf"[0-9a-fA-F]{{{MIN_TOKEN},}}")
_HEX_ESCAPES = re.compile(rf"(?:\\x[0-9a-fA-F]{{2}}){{{MIN_HEX_ESCAPES},}}")


@dataclass(frozen=True, kw_only=True)
class HighEntropyRule(Rule):
    def hits(self, file: FileEntry) -> Iterator[Hit]:
        last_line = 0
        for lineno, segment in text.iter_scan_lines(file.content):
            if lineno == last_line:
                continue
            note = self._check(_DATA_IMAGE.sub(" ", segment))
            if note:
                last_line = lineno
                yield Hit(line=lineno, text=segment, note=note)

    @staticmethod
    def _check(segment: str) -> str | None:
        if _HEX_ESCAPES.search(segment):
            return "long run of \\xNN escape sequences"
        for m in _TOKEN.finditer(segment):
            entropy = text.shannon_entropy(m.group())
            if entropy > BASE64_ENTROPY:
                return f"{len(m.group())}-char string with entropy {entropy:.2f} bits/char"
        # Hex can never exceed 4.0 bits/char, so it needs its own threshold.
        for m in _HEX_RUN.finditer(segment):
            entropy = text.shannon_entropy(m.group())
            if entropy > HEX_ENTROPY:
                return f"{len(m.group())}-char hex string with entropy {entropy:.2f} bits/char"
        return None


HIGH_ENTROPY = HighEntropyRule(
    id="GR-OBF-001",
    title="Long random-looking string (possible hidden payload)",
    category="obfuscation",
    weight=15,
    exclude=(
        "*.min.js",
        "*.min.css",
        "package-lock.json",
        "yarn.lock",
        "pnpm-lock.yaml",
        "poetry.lock",
        "uv.lock",
        "Cargo.lock",
        "Gemfile.lock",
        "composer.lock",
        "go.sum",
    ),
    why=(
        "Long strings that look random are typical of encoded or encrypted "
        "payloads that are decoded at runtime. They can also be harmless data "
        "(keys, fonts), so this is a weak signal on its own."
    ),
)

RULES = (HIGH_ENTROPY,)
