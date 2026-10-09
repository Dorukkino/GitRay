/**
 * Invariants of our own code. GitRay must never run what it scans, never write
 * it to disk, never render it as HTML, and must not contain the invisible
 * characters it warns about (they slipped into the code base twice before).
 */

import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { walk } from "./helpers";

const ROOT = resolve(__dirname, "..");
const SOURCE = walk(join(ROOT, "src"), [".ts", ".tsx"]);
const OWN_FILES = [
  ...SOURCE,
  ...walk(join(ROOT, "tests"), [".ts", ".tsx", ".fixture"]),
  join(ROOT, "CLAUDE.md"),
  join(ROOT, "PROGRESS.md"),
  join(ROOT, "README.md"),
];

const cp = (n: number) => String.fromCodePoint(n);
const range = (a: number, b: number) => `${cp(a)}-${cp(b)}`;
const INVISIBLE = new RegExp(
  `[${range(0x200b, 0x200f)}${range(0x202a, 0x202e)}${range(0x2066, 0x2069)}${cp(0x2028)}${cp(0x2029)}${cp(0xfeff)}${range(0xfe00, 0xfe0f)}${cp(0x3164)}]`,
  "u",
);

const rel = (f: string) => relative(ROOT, f);

describe("own code", () => {
  it.each(OWN_FILES.map((f) => [rel(f), f]))("%s has no invisible or bidi characters", (_name, file) => {
    const text = readFileSync(file, "utf8");
    const m = INVISIBLE.exec(text);
    expect(m && `U+${m[0].codePointAt(0)?.toString(16)} at offset ${m.index}`).toBeNull();
  });

  it("never renders untrusted text as HTML", () => {
    for (const f of SOURCE) expect(readFileSync(f, "utf8"), rel(f)).not.toMatch(/dangerouslySetInnerHTML|\.innerHTML\s*=/);
  });

  it("never starts processes or evaluates code", () => {
    const forbidden = /from\s+["'](?:node:)?(?:child_process|vm|worker_threads)["']|require\(\s*["'](?:node:)?child_process|\bnew Function\s*\(/;
    for (const f of SOURCE) expect(readFileSync(f, "utf8"), rel(f)).not.toMatch(forbidden);
  });

  it("never writes to disk from the engine", () => {
    for (const f of SOURCE.filter((x) => x.includes(`${join("src", "engine")}`))) {
      expect(readFileSync(f, "utf8"), rel(f)).not.toMatch(/["'](?:node:)?fs(?:\/promises)?["']/);
    }
  });
});
