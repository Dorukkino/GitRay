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
  // Python package metadata: the project's README as "long description".
  "pkg-info",
  "metadata",
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
 * A bundled or minified file: large with very long lines (no reviewer reads it).
 * Used to skip human-review attacks (Trojan Source) and generated-code analysis.
 * Not used by payload detection, where a one-line blob is exactly what we look for.
 */
export function isMinified(content: string): boolean {
  const avgLineLength = content.length / (content.split("\n", 2000).length || 1);
  return content.length > 20_000 && avgLineLength > 400;
}

const TEST_DIRS = new Set([
  "test",
  "tests",
  "spec",
  "specs",
  "__tests__",
  "__mocks__",
  "__fixtures__",
  "fixtures",
  "testdata",
  "test-data",
  "test_data",
  "e2e",
]);
const TEST_FILE = /(?:\.(?:test|spec)\.[a-z0-9]+|_test\.[a-z0-9]+|^test_[^/]*\.(?:py|sh|ps1|rb|pl|js|ts|bat|cmd)|Tests?\.(?:cs|java|kt))$/;

/**
 * Test code and test data ("tests/", "spec/", "fixtures/", "*.test.ts", "test_x.py").
 * Nothing here runs when a repository is cloned or installed; security tools keep
 * their attack samples here. Used to label findings and in scoring.ts, never to skip files.
 */
export function isTestPath(path: string): boolean {
  const parts = path.split("/");
  const name = parts.pop() ?? "";
  return parts.some((part) => TEST_DIRS.has(part.toLowerCase())) || TEST_FILE.test(name);
}

/**
 * A command (e.g. an install script) that runs a file in a test path, as in
 * `postinstall: node tests/setup.js`. Used by scoring.ts: an autorun that starts
 * a test-folder file is why test findings can still raise the verdict. A plain
 * `patch-package` or `tsc -b` does not reference the tests, so it must not.
 */
export function referencesTestPath(command: string): boolean {
  for (const token of command.split(/[\s"'`=(),;|&<>]+/)) {
    const p = token.replace(/\\/g, "/").replace(/^\.?\//, "");
    if (p && (isTestPath(p) || TEST_DIRS.has(p.toLowerCase()))) return true;
  }
  return false;
}

// "#" starts a comment in shell, Python, Ruby, YAML, Dockerfiles and PowerShell,
// but not a C preprocessor directive or a shebang.
const COMMENT_LINE =
  /^\s*(?:#(?!!|\s*(?:define|include|if|ifdef|ifndef|elif|else|endif|undef|pragma|import|error|line)\b)|\/\/|\/\*|\*(?:\s|\/|$)|<!--|rem(?:\s+(?![=:(+\-*/%<>!.,])|$))/i;

/** The whole line is a comment, in any common language. Comments never run. */
export function isCommentLine(text: string): boolean {
  return COMMENT_LINE.test(text);
}

type CodeLanguage = "js" | "py" | "c";

const JS_SUFFIXES = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".mts", ".cts", ".tsx", ".vue", ".svelte", ".astro"]);
const PY_SUFFIXES = new Set([".py", ".pyw"]);
const C_LIKE_SUFFIXES = new Set([
  ".go", ".rs", ".java", ".kt", ".kts", ".cs", ".swift", ".scala", ".dart", ".groovy",
  ".c", ".h", ".cc", ".cpp", ".cxx", ".hpp", ".hh", ".php",
]);

function codeLanguage(path: string): CodeLanguage | null {
  const ext = extension(path);
  if (JS_SUFFIXES.has(ext)) return "js";
  if (PY_SUFFIXES.has(ext)) return "py";
  return C_LIKE_SUFFIXES.has(ext) ? "c" : null;
}

/** Calls whose string arguments are regular expressions, matched against the code just before "(". */
const PATTERN_CALL =
  /(?:\bRegExp|\bre\.(?:compile|search|match|fullmatch|findall|finditer|sub|subn|split)|\bregexp\.(?:MustCompile|Compile|MatchString)|\bRegex(?:::new)?|\bPattern\.compile|\bpreg_(?:match|match_all|replace|split))\s*$/;
/** After these, a "/" starts a regular expression literal rather than a division. */
const REGEX_AFTER_CHAR = new Set("(,=:[!&|?{};+-*%<>~^".split(""));
const REGEX_AFTER_WORD = /\b(?:return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await)\s*$/;
/**
 * Code that runs text: with one of these outside the patterns, a pattern on the
 * line may be a hidden payload (eval(/.../.source)) and keeps its full weight.
 */
const RUNS_TEXT =
  /(?<![\w.$])(?:eval|exec|Function|system|popen)\s*\(|\b(?:execSync|execFileSync|execFile|spawnSync|spawn)\s*\(|\.(?:source|pattern)\b|child_process|subprocess|os\.system/;

/**
 * One line of code split into the regular expressions it defines (regex literals
 * and the string arguments of regex constructors) and the rest, with strings,
 * patterns and comments blanked out. A best-effort scan of one line, not a parser.
 */
function lexPatterns(line: string, lang: CodeLanguage): { patterns: [number, number][]; code: string } {
  const patterns: [number, number][] = [];
  let code = "";
  let depth = 0;
  let patternCall = -1;
  let i = 0;
  const n = line.length;
  while (i < n) {
    const c = line[i];
    if ((lang === "py" && c === "#") || (lang !== "py" && c === "/" && line[i + 1] === "/")) break;
    if (lang !== "py" && c === "/" && line[i + 1] === "*") {
      const close = line.indexOf("*/", i + 2);
      const end = close === -1 ? n : close + 2;
      code += " ".repeat(end - i);
      i = end;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n && line[j] !== c) j += line[j] === "\\" ? 2 : 1;
      const end = Math.min(n, j + 1);
      const tagged = c === "`" && /\bString\.raw\s*$/.test(code);
      if (tagged || (patternCall !== -1 && depth >= patternCall)) patterns.push([i, end]);
      code += " ".repeat(end - i);
      i = end;
      continue;
    }
    if (lang === "js" && c === "/") {
      const before = code.trimEnd();
      if (before === "" || REGEX_AFTER_CHAR.has(before[before.length - 1]) || REGEX_AFTER_WORD.test(before)) {
        let j = i + 1;
        let inClass = false;
        while (j < n) {
          const d = line[j];
          if (d === "\\") {
            j += 2;
            continue;
          }
          if (inClass) inClass = d !== "]";
          else if (d === "[") inClass = true;
          else if (d === "/") break;
          j++;
        }
        if (j < n) {
          j++;
          while (j < n && /[a-z]/i.test(line[j])) j++;
          patterns.push([i, j]);
          code += " ".repeat(j - i);
          i = j;
          continue;
        }
      }
    }
    if (c === "(") {
      if (PATTERN_CALL.test(code)) patternCall = depth + 1;
      depth++;
    } else if (c === ")") {
      if (depth === patternCall) patternCall = -1;
      depth = Math.max(0, depth - 1);
    }
    code += c;
    i++;
  }
  return { patterns, code };
}

/**
 * The text at `column` is a search pattern in source code: inside a regular
 * expression literal or a string handed to a regex constructor, on a line that
 * does not also run text. Detection tools describe attacks this way; a pattern
 * is matched against data, never executed.
 */
export function inSearchPattern(path: string, line: string, column: number): boolean {
  const lang = codeLanguage(path);
  if (!lang) return false;
  const { patterns, code } = lexPatterns(line, lang);
  if (RUNS_TEXT.test(code)) return false;
  return patterns.some(([start, end]) => column >= start && column < end);
}

/**
 * The quote character of the string literal open at `index` in a single line
 * (", ' or `), or null outside strings. Backslash escapes are honored; it is a
 * best-effort scan of one line, not a parser.
 */
export function openQuoteAt(text: string, index: number): string | null {
  let quote: string | null = null;
  for (let i = 0; i < index && i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === "`") {
      quote = c;
    }
  }
  return quote;
}

/** Index of the quote that closes a string literal open at `from`, or -1. */
export function closingQuote(text: string, from: number, quote: string): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === quote) return i;
  }
  return -1;
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
  /** Where the window starts in the line (0 for the first window and for short lines). */
  offset: number;
}

/** Yield lines; long lines are yielded as overlapping windows. */
export function* iterScanLines(content: string): Generator<ScanLine> {
  const lines = splitLines(content);
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    if (text.length <= SCAN_WINDOW) {
      yield { line: i + 1, text, offset: 0 };
      continue;
    }
    const step = SCAN_WINDOW - SCAN_OVERLAP;
    for (let start = 0; start < text.length; start += step) {
      yield { line: i + 1, text: text.slice(start, start + SCAN_WINDOW), offset: start };
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

/** Cut to at most `max` UTF-16 units without splitting a surrogate pair (an emoji). */
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  let end = max - 1;
  const last = s.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return `${s.slice(0, end)}…`;
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
  // Slicing may have split a surrogate pair; lone surrogates are not valid JSON for Postgres.
  return defang(text).toWellFormed();
}

/**
 * Make untrusted text (paths, descriptions, notes) safe to show: hidden
 * characters are revealed, URLs defanged, length bounded.
 */
export function sanitize(s: string, max = SNIPPET_MAX): string {
  // toWellFormed last: truncating must not leave half of an emoji behind.
  return truncate(defang(revealHidden(s).text), max).toWellFormed();
}

/**
 * Parse JSON with comments and trailing commas (VS Code settings, devcontainer.json).
 * Returns null when the text is not valid even then. Never evaluates anything.
 */
export function parseJsonc(text: string): unknown {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === "\\") out += text[++i] ?? "";
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 1;
    } else {
      out += c;
    }
  }
  // Trailing commas outside strings: strings were copied verbatim, so match them whole and keep them.
  const cleaned = out.replace(/"(?:[^"\\]|\\.)*"|,(\s*[}\]])/g, (m, close?: string) => (close === undefined ? m : close));
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}
