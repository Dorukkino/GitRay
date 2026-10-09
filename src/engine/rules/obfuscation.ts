/** GR-OBF-*: obfuscated, packed or hidden content. */

import { STEGO_CLASS, ZERO_WIDTH_CLASS, closingQuote, isSourcePath, iterScanLines, openQuoteAt, shannonEntropy } from "../text";
import type { TextFile } from "../types";
import type { Hit, Rule } from "./base";

const MIN_TOKEN = 200;
// Random base64 is ~5.8 bits/char (max 6.0); random hex ~3.9 (max 4.0).
const BASE64_ENTROPY = 5.0;
const HEX_ENTROPY = 3.5;
const MIN_HEX_ESCAPES = 50;

// Embedded images, fonts, media and source maps are legitimate in README, HTML,
// CSS, SVG and bundled JavaScript. Script types (data:text/javascript, ...) stay in scope.
const EMBEDDED_MEDIA =
  /data:(?:(?:image|font|audio|video)\/[\w.+-]+|application\/(?:json|pdf|(?:x-)?font-[\w.+-]+|vnd\.ms-fontobject))(?:;[\w.+-]+(?:=[\w.+-]+)?)*;base64,[A-Za-z0-9+/=]+/gi;
// Tokens inside links (signed image URLs, JWTs in query strings, playground links
// that carry their code in the "#..." part) are not payloads.
const LINK = /\bhttps?:\/\/[^\s"'<>()`]+|\]\([^()\s]+\)/gi;
const TOKEN = new RegExp(`[A-Za-z0-9+/=_-]{${MIN_TOKEN},}`, "g");
const HEX_RUN = new RegExp(`[0-9a-fA-F]{${MIN_TOKEN},}`, "g");
const HEX_ESCAPES = new RegExp(`(?:\\\\x[0-9a-fA-F]{2}){${MIN_HEX_ESCAPES},}`);

/** A short pattern repeated over and over ("ABCDEF0123456789ABCDEF...") is not random. */
function isPeriodic(s: string): boolean {
  for (let period = 1; period <= 64 && period * 2 <= s.length; period++) {
    let i = period;
    while (i < s.length && s[i] === s[i - period]) i++;
    if (i === s.length) return true;
  }
  return false;
}

const startsWithBytes = (b: Uint8Array, magic: readonly number[], offset = 0): boolean =>
  b.length >= offset + magic.length && magic.every((v, i) => b[offset + i] === v);
const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));

/** File signatures of images, fonts, media, documents and certificates. Executables and compressed data are not here. */
const MEDIA_MAGICS: readonly (readonly number[])[] = [
  [0x89, 0x50, 0x4e, 0x47], // PNG
  [0xff, 0xd8, 0xff], // JPEG
  ascii("GIF8"),
  ascii("RIFF"), // WebP, WAV, AVI
  ascii("wOFF"),
  ascii("wOF2"),
  [0x00, 0x01, 0x00, 0x00], // TrueType
  ascii("OTTO"),
  ascii("ttcf"),
  ascii("%PDF"),
  [0x1a, 0x45, 0xdf, 0xa3], // WebM, Matroska
  ascii("OggS"),
  ascii("fLaC"),
  ascii("ID3"), // MP3
  [0x00, 0x00, 0x01, 0x00], // ICO
  [0x30, 0x82], // DER: certificates and public keys
];
const TEXT_FORMATS = /^\s*(?:\{\s*"|\[\s*[{"]|<svg\b|<\?xml\b|-----BEGIN [A-Z ]+-----)/;

function decodedHead(token: string): Uint8Array | null {
  const chars = token.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  const head = chars.slice(0, 96 - (Math.min(chars.length, 96) % 4));
  if (head.length < 8) return null;
  try {
    return Uint8Array.from(atob(head), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function isKnownFormat(b: Uint8Array): boolean {
  if (MEDIA_MAGICS.some((m) => startsWithBytes(b, m))) return true;
  if (startsWithBytes(b, ascii("ftyp"), 4)) return true; // MP4, MOV, HEIC
  // .NET strong-name public key blob ("RSA1" header), as in InternalsVisibleTo(..., PublicKey=...).
  for (let i = 0; i + 4 <= Math.min(b.length, 32); i++) if (startsWithBytes(b, ascii("RSA1"), i)) return true;
  return TEXT_FORMATS.test(String.fromCharCode(...b.subarray(0, 64)));
}

/** Base64 that decodes to a known harmless format (inline images, fonts, source maps, certificates, JSON). */
function isBenignBase64(token: string): boolean {
  if (isPeriodic(token)) return true;
  return base64Candidates(token).some((candidate) => {
    const head = decodedHead(candidate);
    return head !== null && isKnownFormat(head);
  });
}

function isBenignHex(token: string): boolean {
  if (isPeriodic(token)) return true;
  const bytes = Uint8Array.from(token.slice(0, 64).match(/../g) ?? [], (h) => parseInt(h, 16));
  return isKnownFormat(bytes);
}

/**
 * Candidates to decode: the token itself and, for "key=value" runs such as
 * "session=eyJ...", the value after the first "=".
 */
function base64Candidates(token: string): string[] {
  const eq = token.indexOf("=");
  return eq > 0 && eq < token.length - 1 && token[eq + 1] !== "=" ? [token, token.slice(eq + 1)] : [token];
}

/** `continued`: the segment is a later window of a long line, so a token at its start began earlier. */
function entropyNote(segment: string, continued = false): { note: string; column: number } | null {
  const hex = HEX_ESCAPES.exec(segment);
  if (hex) return { note: "long run of \\xNN escape sequences", column: hex.index };
  for (const m of segment.matchAll(TOKEN)) {
    // The previous, overlapping window already judged this token from its real start.
    if (continued && m.index === 0) continue;
    const e = shannonEntropy(m[0]);
    if (e > BASE64_ENTROPY && !isBenignBase64(m[0])) {
      return { note: `${m[0].length}-char string with entropy ${e.toFixed(2)} bits/char`, column: m.index };
    }
  }
  // Hex can never exceed 4.0 bits/char, so it needs its own threshold.
  for (const m of segment.matchAll(HEX_RUN)) {
    if (continued && m.index === 0) continue;
    const e = shannonEntropy(m[0]);
    if (e > HEX_ENTROPY && !isBenignHex(m[0])) {
      return { note: `${m[0].length}-char hex string with entropy ${e.toFixed(2)} bits/char`, column: m.index };
    }
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
    // Images, diagrams (draw.io keeps its compressed diagram in the file) and PDFs.
    "*.svg",
    "*.drawio",
    "*.pdf",
  ],
  why:
    "Long strings that look random are typical of encoded or encrypted payloads that are " +
    "decoded at runtime. They can also be harmless data (keys, fonts, test vectors), so " +
    "this is a weak signal on its own.",
  *scanText(file: TextFile): Iterable<Hit> {
    // Mask on the whole file, not per window: a 300 KB inline image spans many
    // windows and only the first one would still contain its "data:" prefix.
    // Same-length replacements without newlines keep lines and columns aligned.
    const blank = (m: string) => " ".repeat(m.length);
    const masked = file.content.replace(EMBEDDED_MEDIA, blank).replace(LINK, blank);
    const originals = iterScanLines(file.content);
    let last = 0;
    for (const { line, text, offset } of iterScanLines(masked)) {
      const original = originals.next().value?.text ?? text;
      if (line === last) continue;
      const found = entropyNote(text, offset > 0);
      if (found) {
        last = line;
        yield { line, text: original, column: found.column, note: found.note };
      }
    }
  },
};

// Only the characters that open an embedding, override or isolate can reorder code.
// The closers (U+202C, U+2069) do nothing on their own and appear in right-to-left strings.
const BIDI_OPENER = new RegExp(
  `[${[0x202a, 0x202b, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068].map((c) => String.fromCodePoint(c)).join("")}]`,
  "u",
);

const TROJAN_SOURCE: Rule = {
  id: "GR-OBF-002",
  title: "Invisible bidirectional control characters in code",
  category: "obfuscation",
  // An attack on human code review; repository malware rarely needs it, while tests of
  // bidi detectors and right-to-left string tables contain these characters legitimately.
  weight: 15,
  // Minified files are never read by a reviewer, so there is nobody to deceive.
  exclude: ["*.min.js", "*.min.mjs", "*.min.css"],
  why:
    "Unicode bidirectional overrides make code display in a different order than the " +
    "compiler reads it (\"Trojan Source\", CVE-2021-42574): a reviewer sees a comment while " +
    "the interpreter runs a command. Right-to-left text is fine in prose, never inside code.",
  *scanText(file: TextFile): Iterable<Hit> {
    // Only source files: bidi controls are legitimate in right-to-left prose and translations.
    if (!isSourcePath(file.path)) return;
    let last = 0;
    for (const { line, text } of iterScanLines(file.content)) {
      const m = line === last ? null : BIDI_OPENER.exec(text);
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
        let hidden = text.slice(start, start + 500);
        // Spaces inside a string literal (recorded terminal output, aligned text) hide
        // nothing unless code follows the end of that string.
        const quote = openQuoteAt(text, start);
        if (quote) {
          const close = closingQuote(text, start, quote);
          if (close === -1) continue;
          hidden = text.slice(close + 1, close + 501);
          if (/^[\s,;:)\]}]*$/.test(hidden)) continue;
        }
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
// Only a filler standing alone as a name ("const {a,X} = ..." with X the filler) is an
// invisible variable; inside words or character ranges ("A-Z" tables) it is data.
const INVISIBLE_IDENTIFIER = new RegExp(
  `(?<![\\p{L}\\p{N}_$\\-])[${String.fromCodePoint(0x3164)}${String.fromCodePoint(0xffa0)}](?![\\p{L}\\p{N}_$\\-])`,
  "u",
);

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
