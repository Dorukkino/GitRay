/** GR-OBF-*: obfuscated, packed or hidden content. */

import { BIDI_CONTROL_CLASS, STEGO_CLASS, ZERO_WIDTH_CLASS, isSourcePath, iterScanLines, shannonEntropy } from "../text";
import type { TextFile } from "../types";
import type { Hit, Rule } from "./base";

const MIN_TOKEN = 200;
// Random base64 is ~5.8 bits/char (max 6.0); random hex ~3.9 (max 4.0).
const BASE64_ENTROPY = 5.0;
const HEX_ENTROPY = 3.5;
const MIN_HEX_ESCAPES = 50;

// Embedded images and fonts are legitimate in README, HTML, CSS and SVG files.
// Script types (data:text/javascript, ...) stay in scope.
const EMBEDDED_MEDIA =
  /data:(?:image\/[\w.+-]+|font\/[\w.+-]+|application\/(?:x-)?font-[\w.+-]+|application\/vnd\.ms-fontobject)(?:;[\w.+-]+=[\w.+-]+)*;base64,[A-Za-z0-9+/=]+/gi;
const TOKEN = new RegExp(`[A-Za-z0-9+/=_-]{${MIN_TOKEN},}`, "g");
const HEX_RUN = new RegExp(`[0-9a-fA-F]{${MIN_TOKEN},}`, "g");
const HEX_ESCAPES = new RegExp(`(?:\\\\x[0-9a-fA-F]{2}){${MIN_HEX_ESCAPES},}`);

function entropyNote(segment: string): { note: string; column: number } | null {
  const hex = HEX_ESCAPES.exec(segment);
  if (hex) return { note: "long run of \\xNN escape sequences", column: hex.index };
  for (const m of segment.matchAll(TOKEN)) {
    const e = shannonEntropy(m[0]);
    if (e > BASE64_ENTROPY) return { note: `${m[0].length}-char string with entropy ${e.toFixed(2)} bits/char`, column: m.index };
  }
  // Hex can never exceed 4.0 bits/char, so it needs its own threshold.
  for (const m of segment.matchAll(HEX_RUN)) {
    const e = shannonEntropy(m[0]);
    if (e > HEX_ENTROPY) return { note: `${m[0].length}-char hex string with entropy ${e.toFixed(2)} bits/char`, column: m.index };
  }
  return null;
}

const HIGH_ENTROPY: Rule = {
  id: "GR-OBF-001",
  title: "Long random-looking string (possible hidden payload)",
  category: "obfuscation",
  weight: 15,
  exclude: [
    "*.min.js",
    "*.min.css",
    "*.map",
    "package-lock.json",
    "npm-shrinkwrap.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "bun.lock",
    "poetry.lock",
    "uv.lock",
    "Pipfile.lock",
    "Cargo.lock",
    "Gemfile.lock",
    "composer.lock",
    "go.sum",
    "*.pem",
    "*.crt",
    "*.asc",
    "*.gpg",
    "*.sig",
  ],
  why:
    "Long strings that look random are typical of encoded or encrypted payloads that are " +
    "decoded at runtime. They can also be harmless data (keys, fonts, test vectors), so " +
    "this is a weak signal on its own.",
  *scanText(file: TextFile): Iterable<Hit> {
    let last = 0;
    for (const { line, text } of iterScanLines(file.content)) {
      if (line === last) continue;
      // Same length, so columns still point into the original text.
      const found = entropyNote(text.replace(EMBEDDED_MEDIA, (m) => " ".repeat(m.length)));
      if (found) {
        last = line;
        yield { line, text, column: found.column, note: found.note };
      }
    }
  },
};

const BIDI_CONTROL = new RegExp(`[${BIDI_CONTROL_CLASS}]`, "u");

const TROJAN_SOURCE: Rule = {
  id: "GR-OBF-002",
  title: "Invisible bidirectional control characters in code",
  category: "obfuscation",
  weight: 30,
  why:
    "Unicode bidirectional overrides make code display in a different order than the " +
    "compiler reads it (\"Trojan Source\", CVE-2021-42574): a reviewer sees a comment while " +
    "the interpreter runs a command. Right-to-left text is fine in prose, never inside code.",
  *scanText(file: TextFile): Iterable<Hit> {
    // Only source files: bidi controls are legitimate in right-to-left prose and translations.
    if (!isSourcePath(file.path)) return;
    let last = 0;
    for (const { line, text } of iterScanLines(file.content)) {
      const m = line === last ? null : BIDI_CONTROL.exec(text);
      if (m) {
        last = line;
        yield { line, text, column: m.index };
      }
    }
  },
};

const MIN_PADDING = 150;
const PADDED = new RegExp(`(?:^|[^ \\t])[ \\t]{${MIN_PADDING},}(?=[^ \\t])`, "g");
const CODE_TOKEN =
  /\b(?:exec|eval|import|require|__import__|system|subprocess|popen|base64|b64decode|atob|fromCharCode|Function|powershell|curl|wget|http|socket|child_process|spawn)\b|[;=(]/;

const PADDED_CODE: Rule = {
  id: "GR-OBF-003",
  title: "Code hidden far to the right of a line",
  category: "obfuscation",
  weight: 40,
  why:
    "Hundreds of spaces push code past the edge of the screen, so GitHub and editors show an " +
    "innocent-looking line while the hidden part runs. Fake GitHub projects use this to " +
    "smuggle loaders into otherwise working code.",
  *scanText(file: TextFile): Iterable<Hit> {
    if (!isSourcePath(file.path)) return;
    let last = 0;
    for (const { line, text } of iterScanLines(file.content)) {
      if (line === last) continue;
      for (const m of text.matchAll(PADDED)) {
        const start = m.index + m[0].length;
        const hidden = text.slice(start, start + 500);
        if (!CODE_TOKEN.test(hidden)) continue;
        last = line;
        yield { line, text, column: start, note: `code starts after ${m[0].replace(/[^ \t]/, "").length} spaces` };
        break;
      }
    }
  },
};

const MIN_INVISIBLE_RUN = 8;
const STEGO_RUN = new RegExp(`[${STEGO_CLASS}${ZERO_WIDTH_CLASS}]{${MIN_INVISIBLE_RUN},}`, "u");
// Hangul fillers render as blank and are valid identifier characters in JavaScript.
const INVISIBLE_IDENTIFIER = new RegExp(`[${String.fromCodePoint(0x3164)}${String.fromCodePoint(0xffa0)}]`, "u");

const INVISIBLE_PAYLOAD: Rule = {
  id: "GR-OBF-004",
  title: "Invisible Unicode characters hiding data or code",
  category: "obfuscation",
  weight: 40,
  why:
    "Long runs of variation selectors, tag or zero-width characters render as nothing but " +
    "can encode a whole program; recent supply-chain worms hid their loaders this way. " +
    "Blank-looking Hangul fillers can also be used as invisible variable names.",
  *scanText(file: TextFile): Iterable<Hit> {
    const source = isSourcePath(file.path);
    for (const { line, text } of iterScanLines(file.content)) {
      const run = STEGO_RUN.exec(text);
      if (run) {
        yield { line, text, column: run.index, note: `${Array.from(run[0]).length} invisible characters in a row` };
        continue;
      }
      const filler = source ? INVISIBLE_IDENTIFIER.exec(text) : null;
      if (filler) yield { line, text, column: filler.index, note: "blank-looking Hangul filler used in code" };
    }
  },
};

export const RULES: readonly Rule[] = [HIGH_ENTROPY, TROJAN_SOURCE, PADDED_CODE, INVISIBLE_PAYLOAD];
