/** Rule definitions and the code that turns rule hits into findings. */

import { isDocPath, iterScanLines, snippet } from "../text";
import type { BinaryFile, Category, Finding, RepoInfo, ScanContext, TextFile } from "../types";

export interface Hit {
  /** For repository-level rules: the file the finding is about (default: none). */
  path?: string;
  line: number;
  /** The line (or window) the hit is on, and where in it; used for the snippet. */
  text: string;
  column?: number;
  /** Overrides the rule weight for this hit (e.g. an escalated install script). */
  weight?: number;
  note?: string;
}

export interface RuleMeta {
  id: string;
  title: string;
  category: Category;
  /** Points this rule adds to the 0-100 score (its highest hit counts once). */
  weight: number;
  /** Plain-language "why is this dangerous". */
  why: string;
  /** Path patterns (matched from the right, case-insensitive). Default: every file. */
  appliesTo?: readonly string[];
  exclude?: readonly string[];
  /** Weight cap inside documentation files; 0 disables the rule there. Only GR-CODE rules use it. */
  docWeight?: number;
}

export interface Rule extends RuleMeta {
  scanText?(file: TextFile, ctx: ScanContext): Iterable<Hit>;
  scanBinary?(file: BinaryFile, ctx: ScanContext): Iterable<Hit>;
  scanRepo?(info: RepoInfo, ctx: ScanContext): Iterable<Hit>;
}

const globCache = new Map<string, RegExp>();

function segmentRegex(glob: string): RegExp {
  let re = globCache.get(glob);
  if (!re) {
    const body = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]");
    re = new RegExp(`^${body}$`, "i");
    globCache.set(glob, re);
  }
  return re;
}

/** Like Python's PurePath.match: "*.md" matches any .md file, "a/*.yml" any .yml in a dir named a. */
export function pathMatches(path: string, patterns: readonly string[]): boolean {
  const parts = path.split("/");
  return patterns.some((pattern) => {
    const pp = pattern.split("/");
    if (pp.length > parts.length) return false;
    const tail = parts.slice(parts.length - pp.length);
    return pp.every((seg, i) => segmentRegex(seg).test(tail[i]));
  });
}

export function ruleApplies(rule: RuleMeta, path: string): boolean {
  return pathMatches(path, rule.appliesTo ?? ["*"]) && !pathMatches(path, rule.exclude ?? []);
}

function toFinding(rule: RuleMeta, path: string, hit: Hit, docContext: boolean): Finding {
  let weight = hit.weight ?? rule.weight;
  if (docContext && rule.docWeight !== undefined) weight = Math.min(weight, rule.docWeight);
  return {
    ruleId: rule.id,
    title: rule.title,
    category: rule.category,
    path,
    line: hit.line,
    snippet: snippet(hit.text, hit.column ?? 0),
    why: rule.why,
    weight,
    docContext,
    note: hit.note ?? null,
  };
}

export function runTextRule(rule: Rule, file: TextFile, ctx: ScanContext): Finding[] {
  if (!rule.scanText || !ruleApplies(rule, file.path)) return [];
  const docContext = rule.docWeight !== undefined && isDocPath(file.path);
  if (docContext && rule.docWeight === 0) return [];
  return Array.from(rule.scanText(file, ctx), (hit) => toFinding(rule, file.path, hit, docContext));
}

export function runBinaryRule(rule: Rule, file: BinaryFile, ctx: ScanContext): Finding[] {
  if (!rule.scanBinary || !ruleApplies(rule, file.path)) return [];
  return Array.from(rule.scanBinary(file, ctx), (hit) => toFinding(rule, file.path, hit, false));
}

export function runRepoRule(rule: Rule, info: RepoInfo, ctx: ScanContext): Finding[] {
  if (!rule.scanRepo) return [];
  return Array.from(rule.scanRepo(info, ctx), (hit) => toFinding(rule, hit.path ?? "", hit, false));
}

/** Reports the first match on each line (at most one hit per line). */
export function regexRule(meta: RuleMeta & { patterns: readonly RegExp[] }): Rule {
  for (const p of meta.patterns) {
    if (p.global || p.sticky) throw new Error(`${meta.id}: patterns must not be global or sticky`);
  }
  return {
    ...meta,
    *scanText(file: TextFile): Iterable<Hit> {
      let last = 0;
      for (const { line, text } of iterScanLines(file.content)) {
        if (line === last) continue;
        for (const p of meta.patterns) {
          const m = p.exec(text);
          if (m) {
            last = line;
            yield { line, text, column: m.index };
            break;
          }
        }
      }
    },
  };
}

/** Line number (1-based) of a character offset in `content`. */
export function lineAt(content: string, offset: number): number {
  let line = 1;
  for (let i = content.indexOf("\n"); i !== -1 && i < offset; i = content.indexOf("\n", i + 1)) line++;
  return line;
}

/** The full text of a 1-based line. */
export function lineText(content: string, line: number): string {
  let start = 0;
  for (let i = 1; i < line; i++) {
    const nl = content.indexOf("\n", start);
    if (nl === -1) return "";
    start = nl + 1;
  }
  const end = content.indexOf("\n", start);
  const text = content.slice(start, end === -1 ? undefined : end);
  return text.endsWith("\r") ? text.slice(0, -1) : text;
}

export const DOWNLOAD_TOOL =
  /\b(?:curl|wget|powershell|pwsh|invoke-webrequest|invoke-restmethod|iwr|irm|bitsadmin|certutil)\b(?!-config\b)/i;
export const URL_PATTERN = /https?:\/\//i;
