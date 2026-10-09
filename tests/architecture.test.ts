/** The engine is a pure package: the web app and CLI depend on it, never the reverse. */

import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { walk } from "./helpers";

const ROOT = resolve(__dirname, "..");
const ENGINE = join(ROOT, "src", "engine");

function imports(file: string): string[] {
  const src = readFileSync(file, "utf8");
  return [...src.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
}

// Node built-ins the engine may use. No file system, no processes, no VM.
const ALLOWED_BUILTINS = new Set(["node:stream", "node:zlib"]);

describe("engine architecture", () => {
  const files = walk(ENGINE, [".ts"]);

  it("has source files", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files.map((f) => [relative(ROOT, f), f]))("%s imports only the engine and allowed built-ins", (_name, file) => {
    for (const spec of imports(file)) {
      if (spec.startsWith(".")) {
        const target = resolve(join(file, ".."), spec);
        expect(target.startsWith(ENGINE), `${spec} leaves src/engine`).toBe(true);
      } else {
        expect(ALLOWED_BUILTINS.has(spec), `${spec} is not allowed in the engine`).toBe(true);
      }
    }
  });
});
