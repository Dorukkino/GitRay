/**
 * Every rule is tested against harmless fake samples in tests/fixtures/rules/<RULE>/{positive,negative}/.
 *
 * Fixture format: header lines, then "# ---", then the virtual file content.
 *
 *   # path: <virtual path inside the repo>
 *   # lines: 3, 5        (positive only: expected finding lines; 0 for binary/repo rules)
 *   # weight: 45         (optional: expected highest weight)
 *   # repo: octo/demo    (optional: the repository being scanned)
 *   # format: text       (text | hex | repo; repo = JSON overrides for the repository metadata)
 *   # ---
 *   <content>
 *
 * Invisible characters are never stored in fixtures: write {U+202E} or {U+FE01*40}.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { allRules, getRule } from "../src/engine/rules";
import { runBinaryRule, runRepoRule, runTextRule } from "../src/engine/rules/base";
import type { Finding, RepoInfo, ScanContext } from "../src/engine/types";
import { SHA } from "./helpers";

const FIXTURES = join(__dirname, "fixtures", "rules");
const NOW = new Date("2026-10-01T00:00:00Z");

const BASE_INFO: RepoInfo = {
  fullName: "octo/demo",
  description: null,
  sizeKb: 10,
  createdAt: "2020-01-01T00:00:00Z",
  pushedAt: "2026-09-01T00:00:00Z",
  defaultBranch: "main",
  headSha: SHA,
  stars: 0,
  forks: 0,
  isFork: false,
  archived: false,
  ownerLogin: "octo",
  ownerType: "User",
  ownerCreatedAt: "2015-01-01T00:00:00Z",
  releaseAssets: [],
};

interface Fixture {
  ruleId: string;
  kind: "positive" | "negative";
  name: string;
  path: string;
  lines: number[];
  weight: number | null;
  format: "text" | "hex" | "repo";
  repo: string | null;
  content: string;
}

export function expandCodePoints(s: string): string {
  return s.replace(/\{U\+([0-9A-Fa-f]{4,6})(?:\*(\d+))?\}/g, (_m, hex: string, n?: string) =>
    String.fromCodePoint(parseInt(hex, 16)).repeat(n ? Number(n) : 1),
  );
}

function load(ruleId: string, kind: "positive" | "negative", file: string): Fixture {
  const raw = readFileSync(join(FIXTURES, ruleId, kind, file), "utf8");
  const sep = raw.indexOf("# ---\n");
  if (sep === -1) throw new Error(`${ruleId}/${kind}/${file}: missing "# ---" separator`);
  const meta = new Map<string, string>();
  for (const line of raw.slice(0, sep).split("\n")) {
    const m = /^# ([a-z]+):\s*(.*)$/.exec(line);
    if (m) meta.set(m[1], m[2].trim());
  }
  return {
    ruleId,
    kind,
    name: file.replace(/\.fixture$/, ""),
    path: meta.get("path") ?? "",
    lines: meta.has("lines") ? meta.get("lines")!.split(",").map((x) => Number(x.trim())) : [],
    weight: meta.has("weight") ? Number(meta.get("weight")) : null,
    format: (meta.get("format") as Fixture["format"]) ?? "text",
    repo: meta.get("repo") ?? null,
    content: raw.slice(sep + "# ---\n".length),
  };
}

function loadAll(): Fixture[] {
  const out: Fixture[] = [];
  for (const ruleId of readdirSync(FIXTURES)) {
    for (const kind of ["positive", "negative"] as const) {
      let files: string[] = [];
      try {
        files = readdirSync(join(FIXTURES, ruleId, kind));
      } catch {
        continue;
      }
      for (const f of files.filter((x) => x.endsWith(".fixture")).sort()) out.push(load(ruleId, kind, f));
    }
  }
  return out;
}

function run(fx: Fixture): Finding[] {
  const rule = getRule(fx.ruleId);
  const info = fx.repo ? { ...BASE_INFO, fullName: fx.repo } : null;
  const [owner, repo] = (fx.repo ?? "/").split("/");
  const ctx: ScanContext = { repo: fx.repo ? { owner, repo } : null, info, now: NOW };
  if (fx.format === "hex") {
    const hex = fx.content.replace(/\s+/g, "");
    const head = Uint8Array.from(hex.match(/../g) ?? [], (b) => parseInt(b, 16));
    return runBinaryRule(rule, { path: fx.path, head, size: head.length }, ctx);
  }
  if (fx.format === "repo") {
    const overrides = JSON.parse(fx.content) as Partial<RepoInfo>;
    const merged = { ...BASE_INFO, ...overrides };
    return runRepoRule(rule, merged, { ...ctx, info: merged });
  }
  return runTextRule(rule, { path: fx.path, content: expandCodePoints(fx.content), truncated: false }, ctx);
}

const ALL = loadAll();
const id = (f: Fixture) => `${f.ruleId}/${f.kind}/${f.name}`;

describe("rule fixtures", () => {
  it.each(ALL.filter((f) => f.kind === "positive").map((f) => [id(f), f] as const))("%s", (_name, fx) => {
    const findings = run(fx);
    expect(fx.lines.length, "positive fixtures must declare expected lines").toBeGreaterThan(0);
    expect([...new Set(findings.map((f) => f.line))].sort((a, b) => a - b)).toEqual(fx.lines);
    expect(findings.every((f) => f.ruleId === fx.ruleId)).toBe(true);
    if (fx.weight !== null) expect(Math.max(...findings.map((f) => f.weight))).toBe(fx.weight);
  });

  it.each(ALL.filter((f) => f.kind === "negative").map((f) => [id(f), f] as const))("%s", (_name, fx) => {
    expect(run(fx)).toEqual([]);
  });
});

describe("rule registry", () => {
  it.each(allRules().map((r) => [r.id]))("%s has positive and negative fixtures", (ruleId) => {
    const kinds = new Set(ALL.filter((f) => f.ruleId === ruleId).map((f) => f.kind));
    expect([...kinds].sort()).toEqual(["negative", "positive"]);
  });

  it("has a fixture folder for registered rules only", () => {
    const registered = new Set(allRules().map((r) => r.id));
    for (const f of ALL) expect(registered.has(f.ruleId), f.ruleId).toBe(true);
  });

  it("has unique ids and complete metadata", () => {
    const rules = allRules();
    expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
    for (const r of rules) {
      expect(r.id).toMatch(/^GR-[A-Z]+-\d{3}$/);
      expect(r.title && r.why && r.category).toBeTruthy();
      expect(r.weight).toBeGreaterThanOrEqual(1);
      expect(r.weight).toBeLessThanOrEqual(100);
      expect(Boolean(r.scanText) || Boolean(r.scanBinary) || Boolean(r.scanRepo)).toBe(true);
    }
  });

  it("only down-weights GR-CODE rules in documentation", () => {
    for (const r of allRules()) {
      if (r.docWeight !== undefined) expect(r.id.startsWith("GR-CODE-"), r.id).toBe(true);
      if (r.id.startsWith("GR-CODE-")) expect(r.docWeight).toBeLessThan(r.weight);
    }
  });

  it("keeps repository signals weak on their own", () => {
    const repoTotal = allRules()
      .filter((r) => r.category === "repo")
      .reduce((n, r) => n + r.weight, 0);
    expect(repoTotal).toBeLessThan(30);
  });
});

describe("rule behaviour", () => {
  it("finds a payload beyond the first window of a very long line", () => {
    const line = `${"x=1;".repeat(5000)}eval(atob("Y29uc29sZS5sb2coMSk="));`;
    const findings = runTextRule(getRule("GR-CODE-001"), { path: "big.js", content: line, truncated: false }, {
      repo: null,
      info: null,
      now: NOW,
    });
    expect(findings.map((f) => f.line)).toEqual([1]);
    expect(findings[0].snippet).toContain("eval(atob(");
  });

  it("marks code rules in documentation as doc context", () => {
    const findings = runTextRule(
      getRule("GR-CODE-004"),
      { path: "README.md", content: "cat ~/.ssh/id_rsa\n", truncated: false },
      { repo: null, info: null, now: NOW },
    );
    expect(findings[0]).toMatchObject({ docContext: true, weight: 3 });
  });
});
