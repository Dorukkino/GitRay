/**
 * A small tokenizer for the languages malware is most often written in. It
 * separates code from comments and strings, so a URL in a comment or a word in
 * a string is never mistaken for a call. It never evaluates anything and stops
 * at a token limit; a file it cannot tokenize is simply not analyzed.
 */

import { extension } from "../text";

export type Lang = "js" | "clike" | "python" | "powershell";

export interface Token {
  /** id: identifier or keyword; str: string literal (value decoded); re: regex literal; op: punctuation; nl: newline. */
  kind: "id" | "str" | "re" | "num" | "op" | "nl";
  value: string;
  line: number;
  /** Column of the first character (0-based); used for Python indentation. */
  col: number;
}

const LANG_BY_EXTENSION: Record<string, Lang> = {
  ".js": "js",
  ".mjs": "js",
  ".cjs": "js",
  ".jsx": "js",
  ".ts": "js",
  ".tsx": "js",
  ".mts": "js",
  ".cts": "js",
  ".cs": "clike",
  ".java": "clike",
  ".kt": "clike",
  ".kts": "clike",
  ".go": "clike",
  ".c": "clike",
  ".cc": "clike",
  ".cpp": "clike",
  ".cxx": "clike",
  ".h": "clike",
  ".hpp": "clike",
  ".py": "python",
  ".pyw": "python",
  ".ps1": "powershell",
  ".psm1": "powershell",
};

export function langOf(path: string): Lang | null {
  return LANG_BY_EXTENSION[extension(path)] ?? null;
}

/** Above this, a file is not analyzed (bundles and generated code). */
export const MAX_TOKENS = 250_000;
/** Deepest template-interpolation nesting lexed; beyond it the file is skipped (stack-overflow guard). */
const MAX_INTERP_DEPTH = 50;

const OPERATORS = [
  ">>>=", "===", "!==", "**=", "<<=", ">>=", "...", "??=", "||=", "&&=", "?.",
  "=>", "==", "!=", "<=", ">=", "&&", "||", "??", "++", "--", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=",
  "::", ":=", "->", "<<", ">>", "**",
];

const ID_START = /[A-Za-z_$À-￿]/;
const ID_PART = /[\w$À-￿]/;

/** Tokens after which a "/" starts a regex literal rather than a division. */
const REGEX_AFTER_KEYWORD = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"]);

class Lexer {
  readonly tokens: Token[] = [];
  private i = 0;
  private line = 1;
  private lineStart = 0;

  constructor(
    private readonly src: string,
    private readonly lang: Lang,
    private readonly depth = 0,
  ) {}

  private push(kind: Token["kind"], value: string, start: number, line = this.line, lineStart = this.lineStart): void {
    if (this.tokens.length >= MAX_TOKENS) throw new TooManyTokens();
    this.tokens.push({ kind, value, line, col: start - lineStart });
  }

  private newline(at: number): void {
    this.line += 1;
    this.lineStart = at + 1;
  }

  /** Advances over [from, to), counting newlines inside (strings and comments span lines). */
  private skipTo(to: number): void {
    for (let k = this.i; k < to; k++) if (this.src.charCodeAt(k) === 10) this.newline(k);
    this.i = to;
  }

  run(): Token[] {
    const s = this.src;
    while (this.i < s.length) {
      const c = s[this.i];
      if (c === "\n") {
        this.push("nl", "\n", this.i);
        this.newline(this.i);
        this.i += 1;
        continue;
      }
      if (c === " " || c === "\t" || c === "\r" || c === "\f" || c === "\v") {
        this.i += 1;
        continue;
      }
      if (this.comment()) continue;
      if (this.string()) continue;
      if (/[0-9]/.test(c)) {
        let j = this.i + 1;
        while (j < s.length && /[\w.]/.test(s[j])) j++;
        this.push("num", s.slice(this.i, j), this.i);
        this.i = j;
        continue;
      }
      if (this.identifier()) continue;
      if (this.lang === "js" && c === "/" && this.regexAllowed() && this.regex()) continue;
      // Line continuation in Python and PowerShell (backtick) joins two physical lines.
      if ((this.lang === "python" && c === "\\") || (this.lang === "powershell" && c === "`")) {
        if (s[this.i + 1] === "\n" || (s[this.i + 1] === "\r" && s[this.i + 2] === "\n")) {
          this.skipTo(s[this.i + 1] === "\n" ? this.i + 2 : this.i + 3);
          continue;
        }
      }
      const op = OPERATORS.find((o) => s.startsWith(o, this.i));
      const value = op ?? c;
      this.push("op", value, this.i);
      this.i += value.length;
    }
    return this.tokens;
  }

  private comment(): boolean {
    const s = this.src;
    const c = s[this.i];
    if (this.lang === "python" || this.lang === "powershell") {
      if (this.lang === "powershell" && s.startsWith("<#", this.i)) {
        const end = s.indexOf("#>", this.i + 2);
        this.skipTo(end < 0 ? s.length : end + 2);
        return true;
      }
      if (c === "#") {
        const end = s.indexOf("\n", this.i);
        this.i = end < 0 ? s.length : end;
        return true;
      }
      return false;
    }
    if (s.startsWith("//", this.i)) {
      const end = s.indexOf("\n", this.i);
      this.i = end < 0 ? s.length : end;
      return true;
    }
    if (s.startsWith("/*", this.i)) {
      const end = s.indexOf("*/", this.i + 2);
      this.skipTo(end < 0 ? s.length : end + 2);
      return true;
    }
    return false;
  }

  private identifier(): boolean {
    const s = this.src;
    const c = s[this.i];
    if (this.lang === "powershell") {
      // $name, $env:NAME, ${any name}, @splat; command and parameter names may contain "-".
      if (c === "$" || (c === "@" && ID_START.test(s[this.i + 1] ?? ""))) {
        if (s[this.i + 1] === "{") {
          const end = s.indexOf("}", this.i + 2);
          const stop = end < 0 ? s.length : end + 1;
          this.push("id", `$${s.slice(this.i + 2, stop - 1)}`.toLowerCase(), this.i);
          this.skipTo(stop);
          return true;
        }
        let j = this.i + 1;
        while (j < s.length && /[\w:?]/.test(s[j])) j++;
        if (j === this.i + 1) return false;
        this.push("id", `$${s.slice(this.i + 1, j)}`.toLowerCase(), this.i);
        this.i = j;
        return true;
      }
      if (c === "-" && /[A-Za-z]/.test(s[this.i + 1] ?? "") && /[\s(]/.test(s[this.i - 1] ?? " ")) {
        let j = this.i + 1;
        while (j < s.length && /[\w]/.test(s[j])) j++;
        this.push("id", s.slice(this.i, j).toLowerCase(), this.i);
        this.i = j;
        return true;
      }
      if (ID_START.test(c) && c !== "$") {
        let j = this.i + 1;
        while (j < s.length && (/[\w]/.test(s[j]) || (s[j] === "-" && /[A-Za-z]/.test(s[j + 1] ?? "")))) j++;
        this.push("id", s.slice(this.i, j).toLowerCase(), this.i);
        this.i = j;
        return true;
      }
      return false;
    }
    if (!ID_START.test(c)) return false;
    let j = this.i + 1;
    while (j < s.length && ID_PART.test(s[j])) j++;
    this.push("id", s.slice(this.i, j), this.i);
    this.i = j;
    return true;
  }

  private regexAllowed(): boolean {
    const prev = this.lastSignificant();
    if (!prev) return true;
    if (prev.kind === "id") return REGEX_AFTER_KEYWORD.has(prev.value);
    if (prev.kind === "op") return prev.value !== ")" && prev.value !== "]" && prev.value !== "}";
    return false;
  }

  private lastSignificant(): Token | undefined {
    for (let k = this.tokens.length - 1; k >= 0; k--) if (this.tokens[k].kind !== "nl") return this.tokens[k];
    return undefined;
  }

  private regex(): boolean {
    const s = this.src;
    let j = this.i + 1;
    let inClass = false;
    while (j < s.length) {
      const ch = s[j];
      if (ch === "\n") return false;
      if (ch === "\\") {
        j += 2;
        continue;
      }
      if (ch === "[") inClass = true;
      else if (ch === "]") inClass = false;
      else if (ch === "/" && !inClass) break;
      j++;
    }
    if (j >= s.length || j === this.i + 1) return false;
    this.push("re", s.slice(this.i + 1, j), this.i);
    j++;
    while (j < s.length && /[a-z]/.test(s[j])) j++;
    this.i = j;
    return true;
  }

  /** Emits literal text, then lexes the interpolated expression until its closing brace. */
  private interpolation(text: string[], start: number, line: number, lineStart: number, from: number, close: string): number {
    this.push("str", text.join(""), start, line, lineStart);
    text.length = 0;
    // Deeply nested `${`${…}`}` would recurse without bound (stack overflow);
    // treat past the cap as too complex to analyze, like a token overflow.
    if (this.depth >= MAX_INTERP_DEPTH) throw new TooManyTokens();
    const end = matchingBrace(this.src, from, close);
    const inner = new Lexer(this.src.slice(from, end), this.lang, this.depth + 1);
    inner.line = this.line;
    for (const t of inner.run()) {
      if (t.kind === "nl") continue;
      if (this.tokens.length >= MAX_TOKENS) throw new TooManyTokens();
      this.tokens.push({ ...t, col: t.line === this.line ? t.col + (from - this.lineStart) : t.col });
    }
    return end;
  }

  private string(): boolean {
    const s = this.src;
    const start = this.i;
    const line = this.line;
    const lineStart = this.lineStart;
    let k = this.i;

    if (this.lang === "python") {
      const m = /^([rRbBuUfF]{0,2})("""|'''|"|')/.exec(s.slice(k, k + 5));
      if (!m || (m[1] && !ID_START.test(s[k]))) return false;
      if (m[1] && this.tokens.length && /[\w.]/.test(s[k - 1] ?? "")) return false;
      const prefix = m[1].toLowerCase();
      const quote = m[2];
      const raw = prefix.includes("r");
      const fmt = prefix.includes("f");
      k += m[0].length;
      const text: string[] = [];
      while (k < s.length && !s.startsWith(quote, k)) {
        const ch = s[k];
        if (quote.length === 1 && ch === "\n") break;
        if (ch === "\\" && !raw) {
          text.push(s[k + 1] ?? "");
          k += 2;
          continue;
        }
        if (fmt && ch === "{") {
          if (s[k + 1] === "{") {
            text.push("{");
            k += 2;
            continue;
          }
          this.skipTo(k);
          k = this.interpolation(text, start, line, lineStart, k + 1, "}") + 1;
          continue;
        }
        text.push(ch);
        k++;
      }
      this.push("str", text.join(""), start, line, lineStart);
      this.skipTo(Math.min(s.length, k + quote.length));
      return true;
    }

    if (this.lang === "powershell") {
      const here = /^@(["'])\r?\n/.exec(s.slice(k, k + 4));
      if (here) {
        const close = `\n${here[1]}@`;
        const end = s.indexOf(close, k);
        const stop = end < 0 ? s.length : end + close.length;
        this.push("str", s.slice(k + here[0].length, end < 0 ? s.length : end), start, line, lineStart);
        this.skipTo(stop);
        return true;
      }
      const q = s[k];
      if (q !== '"' && q !== "'") return false;
      k++;
      const text: string[] = [];
      while (k < s.length) {
        const ch = s[k];
        if (ch === q) {
          if (s[k + 1] === q) {
            text.push(q);
            k += 2;
            continue;
          }
          break;
        }
        if (q === '"' && ch === "`") {
          text.push(s[k + 1] ?? "");
          k += 2;
          continue;
        }
        if (q === '"' && ch === "$" && (s[k + 1] === "(" || /[\w{]/.test(s[k + 1] ?? ""))) {
          // "$var" and "$(expr)" expand inside double quotes: lex them as code.
          this.skipTo(k);
          if (s[k + 1] === "(") {
            k = this.interpolation(text, start, line, lineStart, k + 2, ")") + 1;
          } else {
            this.push("str", text.join(""), start, line, lineStart);
            text.length = 0;
            this.i = k;
            this.identifier();
            k = this.i;
          }
          continue;
        }
        text.push(ch);
        k++;
      }
      this.push("str", text.join(""), start, line, lineStart);
      this.skipTo(Math.min(s.length, k + 1));
      return true;
    }

    // C-like and JavaScript.
    let verbatim = false;
    let interp = false;
    if (this.lang === "clike") {
      const p = /^(\$@|@\$|@|\$)"/.exec(s.slice(k, k + 3));
      if (p) {
        verbatim = p[1].includes("@");
        interp = p[1].includes("$");
        k += p[1].length;
      }
    }
    const q = s[k];
    if (q !== '"' && q !== "'" && q !== "`") return false;
    // Raw string literals: C# """...""" and Go `...`.
    if (this.lang === "clike" && s.startsWith('"""', k)) {
      const end = s.indexOf('"""', k + 3);
      const stop = end < 0 ? s.length : end + 3;
      this.push("str", s.slice(k + 3, end < 0 ? s.length : end), start, line, lineStart);
      this.skipTo(stop);
      return true;
    }
    if (this.lang === "clike" && q === "`") {
      const end = s.indexOf("`", k + 1);
      const stop = end < 0 ? s.length : end + 1;
      this.push("str", s.slice(k + 1, end < 0 ? s.length : end), start, line, lineStart);
      this.skipTo(stop);
      return true;
    }
    const template = this.lang === "js" && q === "`";
    k++;
    const text: string[] = [];
    while (k < s.length) {
      const ch = s[k];
      if (ch === q) {
        if (verbatim && s[k + 1] === q) {
          text.push(q);
          k += 2;
          continue;
        }
        break;
      }
      if (ch === "\n" && !template && !verbatim) break;
      if (ch === "\\" && !verbatim) {
        text.push(s[k + 1] ?? "");
        k += 2;
        continue;
      }
      if (template && ch === "$" && s[k + 1] === "{") {
        this.skipTo(k);
        k = this.interpolation(text, start, line, lineStart, k + 2, "}") + 1;
        continue;
      }
      if (interp && ch === "{") {
        if (s[k + 1] === "{") {
          text.push("{");
          k += 2;
          continue;
        }
        this.skipTo(k);
        k = this.interpolation(text, start, line, lineStart, k + 1, "}") + 1;
        continue;
      }
      text.push(ch);
      k++;
    }
    this.push("str", text.join(""), start, line, lineStart);
    this.skipTo(Math.min(s.length, k + 1));
    return true;
  }
}

class TooManyTokens extends Error {}

/** Index of the closing bracket for an interpolation that starts at `from` (bounded nesting, strings skipped). */
function matchingBrace(src: string, from: number, close: string): number {
  const open = close === "}" ? "{" : "(";
  let depth = 0;
  for (let k = from; k < src.length; k++) {
    const ch = src[k];
    if (ch === "'" || ch === '"') {
      const end = src.indexOf(ch, k + 1);
      if (end > 0 && src.lastIndexOf("\n", end) < k) k = end;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      if (depth === 0) return k;
      depth--;
    }
  }
  return src.length;
}

/** The file's tokens, or null when it is too large to analyze. */
export function tokenize(content: string, lang: Lang): Token[] | null {
  try {
    return new Lexer(content, lang).run();
  } catch (e) {
    if (e instanceof TooManyTokens) return null;
    throw e;
  }
}
