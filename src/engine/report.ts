/**
 * Display-safe report: the only shape the web UI, the JSON API and the CLI
 * consume. Every string that comes from the scanned repository (paths,
 * snippets, notes, description, release names, branch names) is sanitized here.
 */

import { allRules } from "./rules";
import { sanitize } from "./text";
import type { ArchiveCheck, Category, Finding, ScanResult, Verdict } from "./types";
import { ENGINE_VERSION } from "./version";
import { ARCHIVE_SEPARATOR } from "./zip";

export const MAX_REPORT_FINDINGS = 400;
export const MAX_FINDINGS_PER_RULE = 40;
const PATH_MAX = 300;
const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^sha256:([0-9a-f]{64})$/;
const FULL_NAME = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;

export type Severity = "high" | "medium" | "low";

export function severityOf(weight: number): Severity {
  if (weight >= 35) return "high";
  if (weight >= 15) return "medium";
  return "low";
}

export interface ReportFinding {
  ruleId: string;
  title: string;
  category: Category;
  severity: Severity;
  weight: number;
  path: string;
  line: number;
  snippet: string;
  why: string;
  note: string | null;
  docContext: boolean;
  /** Link to the exact line on github.com, built from validated parts. */
  githubUrl: string | null;
  /** The finding is in a file inside a ZIP ("release.zip!/setup/run.js"). */
  inArchive: boolean;
}

export interface ReportRule {
  id: string;
  title: string;
  category: Category;
  /** Points this rule added to the score. */
  points: number;
  findings: number;
}

export interface ReportAsset {
  releaseTag: string;
  name: string;
  size: number;
  sha256: string | null;
  virusTotalUrl: string | null;
}

export interface Report {
  schemaVersion: 1;
  engineVersion: string;
  target: {
    fullName: string;
    url: string;
    description: string | null;
    defaultBranch: string;
    headSha: string;
    sizeKb: number;
    stars: number;
    forks: number;
    isFork: boolean;
    archived: boolean;
    createdAt: string;
    pushedAt: string | null;
    owner: { login: string; type: string; createdAt: string | null };
  } | null;
  verdict: Verdict;
  score: number;
  complete: boolean;
  partial: { limit: string; limitValue: number; reason: string; filesScanned: number } | null;
  /** Whether GitHub's archive held every file of the commit (see ArchiveCheck). */
  archiveCheck: ArchiveCheck;
  stats: ScanResult["stats"];
  rules: ReportRule[];
  findings: ReportFinding[];
  /** Findings left out of `findings` to keep the report small. */
  omittedFindings: number;
  releaseAssets: ReportAsset[];
  rulesRun: number;
  startedAt: string;
  durationMs: number;
}

function githubLine(fullName: string, sha: string, f: Finding): string | null {
  if (!f.path || !FULL_NAME.test(fullName) || !SHA.test(sha)) return null;
  // A file inside a ZIP has no page of its own: link to the ZIP.
  const separator = f.path.indexOf(ARCHIVE_SEPARATOR);
  const inArchive = separator !== -1;
  const filePath = inArchive ? f.path.slice(0, separator) : f.path;
  const path = filePath.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${fullName}/blob/${sha}/${path}${f.line > 0 && !inArchive ? `#L${f.line}` : ""}`;
}

function byImportance(a: Finding, b: Finding): number {
  return b.weight - a.weight || a.path.localeCompare(b.path) || a.line - b.line;
}

export function toReport(result: ScanResult): Report {
  const repo = result.repo;
  const titles = new Map(allRules().map((r) => [r.id, r]));
  const counts = new Map<string, number>();
  for (const f of result.findings) counts.set(f.ruleId, (counts.get(f.ruleId) ?? 0) + 1);

  // Keep the strongest findings, at most MAX_FINDINGS_PER_RULE per rule.
  const kept: Finding[] = [];
  const perRule = new Map<string, number>();
  for (const f of [...result.findings].sort(byImportance)) {
    const n = perRule.get(f.ruleId) ?? 0;
    if (n >= MAX_FINDINGS_PER_RULE || kept.length >= MAX_REPORT_FINDINGS) continue;
    perRule.set(f.ruleId, n + 1);
    kept.push(f);
  }

  const fullName = repo && FULL_NAME.test(repo.fullName) ? repo.fullName : null;
  return {
    schemaVersion: 1,
    engineVersion: ENGINE_VERSION,
    target:
      repo && fullName
        ? {
            fullName,
            url: `https://github.com/${fullName}`,
            description: repo.description ? sanitize(repo.description, 300) : null,
            defaultBranch: sanitize(repo.defaultBranch, 100),
            headSha: SHA.test(repo.headSha) ? repo.headSha : "",
            sizeKb: repo.sizeKb,
            stars: repo.stars,
            forks: repo.forks,
            isFork: repo.isFork,
            archived: repo.archived,
            createdAt: sanitize(repo.createdAt, 40),
            pushedAt: repo.pushedAt ? sanitize(repo.pushedAt, 40) : null,
            owner: {
              login: sanitize(repo.ownerLogin, 60),
              type: sanitize(repo.ownerType, 30),
              createdAt: repo.ownerCreatedAt ? sanitize(repo.ownerCreatedAt, 40) : null,
            },
          }
        : null,
    verdict: result.verdict,
    score: result.score,
    complete: result.partial === null,
    partial: result.partial
      ? {
          limit: result.partial.limit,
          limitValue: result.partial.limitValue,
          reason: sanitize(result.partial.reason),
          filesScanned: result.stats.textFiles + result.stats.binaryFiles,
        }
      : null,
    archiveCheck: { ...result.archiveCheck },
    stats: { ...result.stats },
    rules: Object.entries(result.ruleScores)
      .map(([id, points]) => {
        const rule = titles.get(id);
        return {
          id,
          title: rule?.title ?? id,
          category: rule?.category ?? "code",
          points,
          findings: counts.get(id) ?? 0,
        };
      })
      .sort((a, b) => b.points - a.points || a.id.localeCompare(b.id)),
    findings: kept.map((f) => ({
      ruleId: f.ruleId,
      title: f.title,
      category: f.category,
      severity: severityOf(f.weight),
      weight: f.weight,
      path: sanitize(f.path, PATH_MAX),
      line: f.line,
      snippet: sanitize(f.snippet, 260),
      why: f.why,
      note: f.note ? sanitize(f.note, 300) : null,
      docContext: f.docContext,
      githubUrl: fullName && repo ? githubLine(fullName, repo.headSha, f) : null,
      inArchive: f.path.includes(ARCHIVE_SEPARATOR),
    })),
    omittedFindings: result.findings.length - kept.length,
    releaseAssets: (repo?.releaseAssets ?? []).map((a) => {
      const sha256 = a.digest ? (SHA256.exec(a.digest.toLowerCase())?.[1] ?? null) : null;
      return {
        releaseTag: sanitize(a.releaseTag, 100),
        name: sanitize(a.name, 200),
        size: a.size,
        sha256,
        virusTotalUrl: sha256 ? `https://www.virustotal.com/gui/file/${sha256}` : null,
      };
    }),
    rulesRun: result.rulesRun.length,
    startedAt: result.startedAt,
    durationMs: result.durationMs,
  };
}
