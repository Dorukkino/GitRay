/**
 * Helpers for untrusted text from scanned repositories.
 *
 * Invisible and bidi characters are never written as escape sequences in this
 * code base; they are built from code points (see CLAUDE.md).
 */

/** Long lines are scanned in overlapping windows so regexes stay fast on minified files. */
export const SCAN_WINDOW = 10_000;
export const SCAN_OVERLAP = 1_000;
export const SNIPPET_MAX = 200;
export const BINARY_SNIFF_BYTES = 8192;
/** Whitespace runs at least this long are collapsed in snippets. */
const WHITESPACE_RUN = 20;

const cp = (n: number): string => String.fromCodePoint(n);
const range = (from: number, to: number): string => `${cp(from)}-${cp(to)}`;

/** Bidirectional overrides and isolates used in "Trojan Source" (CVE-2021-42574). */
export const BIDI_CONTROL_CLASS = range(0x202a, 0x202e) + range(0x2066, 0x2069);

/** Variation selectors and tag characters: render as nothing, can encode arbitrary bytes. */
export const STEGO_CLASS =
  range(0xfe00, 0xfe0f) + range(0xe0100, 0xe01ef) + range(0xe0000, 0xe007f);

/** Zero-width characters and fillers that render as nothing. */
export const ZERO_WIDTH_CLASS =
  range(0x200b, 0x200d) + range(0x2060, 0x2064) + cp(0xfeff) + cp(0x3164) + cp(0xffa0);

/** Everything that would hide or reorder text when shown to a user. */
const HIDDEN_CLASS =
  "\\x00-\\x08\\x0b-\\x1f\\x7f-\\x9f" +
  cp(0x00ad) +
  range(0x200b, 0x200f) +
  range(0x2028, 0x202e) +
  range(0x2060, 0x2069) +
  cp(0xfeff) +
  cp(0x3164) +
  cp(0xffa0) +
  range(0xfe00, 0xfe0f) +
  range(0xe0000, 0xe007f) +
  range(0xe0100, 0xe01ef);

const HIDDEN_RUN = new RegExp(`[${HIDDEN_CLASS}]+`, "gu");
const WHITESPACE = new RegExp(`[ \\t]{${WHITESPACE_RUN},}`, "g");
const URL_SCHEME = /\b(h)tt(ps?):\/\/([^\s/?#'"<>]+)/gi;
const FTP_SCHEME = /\bftp:\/\//gi;

const DOC_SUFFIXES = new Set([".md", ".markdown", ".mdown", ".rst", ".adoc", ".asciidoc"]);
const DOC_TXT_NAMES = new Set([
  "readme.txt",
  "changelog.txt",
  "changes.txt",
  "history.txt",
  "license.txt",
  "copying.txt",
  "contributing.txt",
  "authors.txt",
  "notice.txt",
]);

const SOURCE_SUFFIXES = new Set(
  (
    ".py .pyw .js .mjs .cjs .jsx .ts .mts .cts .tsx .c .h .cc .cpp .cxx .hpp .hh .cs .java " +
    ".kt .kts .go .rs .rb .php .pl .pm .lua .swift .m .mm .scala .sh .bash .zsh .fish .ps1 " +
    ".psm1 .psd1 .bat .cmd .vbs .vba .r .dart .groovy .gradle .ex .exs .erl .hs .clj .jl .nim " +
    ".zig .v .sol .coffee .vue .svelte .astro"
  ).split(" "),
);

export function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

export function extension(path: string): string {
  const name = basename(path);
  const i = name.lastIndexOf(".");
  return i <= 0 ? "" : name.slice(i).toLowerCase();
}

/** Documentation files are decided by file type only, never by directory. */
export function isDocPath(path: string): boolean {
  return DOC_SUFFIXES.has(extension(path)) || DOC_TXT_NAMES.has(basename(path).toLowerCase());
}

export function isSourcePath(path: string): boolean {
  return SOURCE_SUFFIXES.has(extension(path));
}

/**
 * Split on "\n" and "\r\n" only, the way editors and GitHub number lines.
 * Other separators (\v, \f, U+2028, ...) would shift reported line numbers.
 */
export function splitLines(content: string): string[] {
  const lines = content.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
}

export interface ScanLine {
  /** 1-based line number. */
  line: number;
  /** The line, or a window of it for very long lines. */
  text: string;
}

/** Yield lines; long lines are yielded as overlapping windows. */
export function* iterScanLines(content: string): Generator<ScanLine> {
  const lines = splitLines(content);
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    if (text.length <= SCAN_WINDOW) {
      yield { line: i + 1, text };
      continue;
    }
    const step = SCAN_WINDOW - SCAN_OVERLAP;
    for (let start = 0; start < text.length; start += step) {
      yield { line: i + 1, text: text.slice(start, start + SCAN_WINDOW) };
      if (start + SCAN_WINDOW >= text.length) break;
    }
  }
}

export function shannonEntropy(s: string): number {
  if (!s) return 0;
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  const n = s.length;
  let h = 0;
  for (const c of counts.values()) h -= (c / n) * Math.log2(c / n);
  return h;
}

export function isBinary(data: Uint8Array): boolean {
  return data.subarray(0, BINARY_SNIFF_BYTES).includes(0);
}

/** Decode file bytes. UTF-16 files (BOM) are common for Windows scripts. */
export function decode(data: Uint8Array): { text: string; utf16: boolean } | null {
  if (data.length >= 2 && data[0] === 0xff && data[1] === 0xfe) {
    return { text: new TextDecoder("utf-16le").decode(data), utf16: true };
  }
  if (data.length >= 2 && data[0] === 0xfe && data[1] === 0xff) {
    return { text: new TextDecoder("utf-16be").decode(data), utf16: true };
  }
  if (isBinary(data)) return null;
  return { text: new TextDecoder("utf-8").decode(data), utf16: false };
}

function hex(n: number): string {
  return n.toString(16).toUpperCase().padStart(4, "0");
}

function describeHidden(run: string): string {
  const points = Array.from(run, (c) => c.codePointAt(0) ?? 0);
  if (points.length === 1) return `[U+${hex(points[0])}]`;
  if (points.every((p) => p === points[0])) return `[U+${hex(points[0])} x${points.length}]`;
  return `[${points.length} hidden chars]`;
}

/**
 * Make hidden content visible: invisible/control/bidi characters become
 * "[U+202E]" markers and long whitespace runs become "[... 153 spaces ...]".
 * `column` (an index into `line`) is mapped to the same place in the result.
 */
export function revealHidden(line: string, column = 0): { text: string; column: number } {
  let mapped = column;
  const replace = (s: string, re: RegExp, fn: (m: string) => string): string => {
    const col = mapped;
    let delta = 0;
    let inside: number | null = null;
    const out = s.replace(re, (m: string, offset: number) => {
      const r = fn(m);
      if (offset + m.length <= col) delta += r.length - m.length;
      else if (offset < col) inside = offset + delta;
      return r;
    });
    mapped = inside ?? col + delta;
    return out;
  };
  let text = replace(line, HIDDEN_RUN, describeHidden);
  text = replace(text, WHITESPACE, (m) => `[... ${m.length} spaces ...]`);
  return { text: text.replace(/\t/g, " "), column: Math.max(0, mapped) };
}

/** Make URLs non-clickable: https://evil.example/x -> hxxps://evil[.]example/x. */
export function defang(s: string): string {
  return s
    .replace(URL_SCHEME, (_m, h: string, ps: string, host: string) => {
      return `${h}xx${ps}://${host.replace(/\./g, "[.]")}`;
    })
    .replace(FTP_SCHEME, "fxp://");
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** A short, display-safe excerpt of a line, centred on `column`. */
export function snippet(line: string, column = 0, max = SNIPPET_MAX): string {
  const revealed = revealHidden(line, column);
  let text = revealed.text;
  const leading = text.length - text.trimStart().length;
  text = text.trim();
  const col = Math.max(0, revealed.column - leading);
  if (text.length > max) {
    const start = Math.max(0, Math.min(col - Math.floor(max / 3), text.length - max));
    const body = text.slice(start, start + max - 2);
    text = `${start > 0 ? "…" : ""}${body}${start + max - 2 < text.length ? "…" : ""}`;
  }
  return defang(text);
}

/**
 * Make untrusted text (paths, descriptions, notes) safe to show: hidden
 * characters are revealed, URLs defanged, length bounded.
 */
export function sanitize(s: string, max = SNIPPET_MAX): string {
  const wellFormed = s.toWellFormed();
  return truncate(defang(revealHidden(wellFormed).text), max);
}
