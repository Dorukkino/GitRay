/**
 * Scan orchestration: repository metadata -> tarball (and the ZIPs inside it)
 * -> files missing from the tarball -> rules -> score.
 */

import { type ArchiveEntry, readArchive } from "./archive";
import { LimitExceeded } from "./errors";
import type { GitHubClient, TreeEntry } from "./github";
import { type Limits, withDefaults } from "./limits";
import { type Rule, allRules } from "./rules";
import { runBinaryRule, runRepoRule, runTextRule } from "./rules/base";
import { score } from "./scoring";
import { decode } from "./text";
import {
  type ArchiveCheck,
  type Category,
  type Finding,
  type PartialScan,
  type RepoInfo,
  type RepoRef,
  type ScanContext,
  type ScanResult,
  type ScanStats,
  emptyStats,
} from "./types";
import { ARCHIVE_SEPARATOR, isZipPath, withArchiveContents } from "./zip";

export interface ScanOptions {
  limits?: Partial<Limits>;
  rules?: readonly Rule[];
  /** Injectable clock for tests. */
  now?: () => Date;
}

const NOT_CHECKED: ArchiveCheck = { status: "skipped", hidden: 0, scanned: 0 };
/** Hidden files downloaded at the same time. */
const HIDDEN_CONCURRENCY = 6;
/** Hidden files that can run or carry code are fetched first. */
const RISKY_HIDDEN =
  /\.(?:js|mjs|cjs|jsx|ts|tsx|py|sh|bash|ps1|psm1|bat|cmd|vbs|vbe|jse|wsf|hta|exe|dll|scr|lnk|msi|jar|zip|rar|7z|rb|php|pl)$|(?:^|\/)(?:package\.json|setup\.py|build\.rs|tasks\.json|Makefile)$|\.(?:cs|vb|fs|vcx)proj$/i;

function contextFor(info: RepoInfo | null, now: Date): ScanContext {
  if (!info) return { repo: null, info: null, now };
  const [owner, repo] = info.fullName.split("/");
  return { repo: { owner, repo }, info, now };
}

/**
 * Rules that judge what a file contains. Inside a ZIP nothing runs on clone or
 * install and no README is shown to visitors, so install-hook, link and
 * social-engineering rules apply only to the repository's own files.
 */
export const ARCHIVE_MEMBER_CATEGORIES: ReadonlySet<Category> = new Set(["code", "obfuscation", "binary"]);

export function scanEntry(entry: ArchiveEntry, rules: readonly Rule[], ctx: ScanContext): Finding[] {
  const findings: Finding[] = [];
  const inArchive = entry.file.path.includes(ARCHIVE_SEPARATOR);
  for (const rule of rules) {
    if (inArchive && !ARCHIVE_MEMBER_CATEGORIES.has(rule.category)) continue;
    findings.push(
      ...(entry.kind === "text" ? runTextRule(rule, entry.file, ctx) : runBinaryRule(rule, entry.file, ctx)),
    );
  }
  return findings;
}

function partialFrom(e: LimitExceeded): PartialScan {
  return { limit: e.limit, limitValue: e.value, reason: e.message };
}

/** Run the rules over every entry; a limit hit ends the loop and is returned as a partial scan. */
async function collect(
  entries: AsyncIterable<ArchiveEntry>,
  rules: readonly Rule[],
  ctx: ScanContext,
  findings: Finding[],
): Promise<PartialScan | null> {
  try {
    for await (const entry of entries) findings.push(...scanEntry(entry, rules, ctx));
    return null;
  } catch (e) {
    if (e instanceof LimitExceeded) return partialFrom(e);
    throw e;
  }
}

function finish(
  info: RepoInfo | null,
  findings: Finding[],
  stats: ScanStats,
  partial: PartialScan | null,
  archiveCheck: ArchiveCheck,
  rules: readonly Rule[],
  started: Date,
  now: () => Date,
): ScanResult {
  const scored = score(findings, partial === null);
  return {
    repo: info,
    findings,
    score: scored.score,
    verdict: scored.verdict,
    ruleScores: scored.ruleScores,
    stats,
    partial,
    archiveCheck,
    rulesRun: rules.map((r) => r.id),
    startedAt: started.toISOString(),
    durationMs: Math.max(0, now().getTime() - started.getTime()),
  };
}

/**
 * Scan a stream of archive entries. ZIP files among them are opened and their
 * members scanned too. A limit hit mid-archive gives a partial result.
 */
export async function scanEntries(
  entries: AsyncIterable<ArchiveEntry> | Iterable<ArchiveEntry>,
  info: RepoInfo | null,
  options: ScanOptions & { stats?: ScanStats; started?: Date; deadline?: number } = {},
): Promise<ScanResult> {
  const now = options.now ?? (() => new Date());
  const started = options.started ?? now();
  const rules = options.rules ?? allRules();
  const limits = withDefaults(options.limits);
  const stats = options.stats ?? emptyStats();
  const ctx = contextFor(info, started);
  const findings: Finding[] = info ? rules.flatMap((rule) => runRepoRule(rule, info, ctx)) : [];
  const partial = await collect(withArchiveContents(entries, limits, stats, options.deadline), rules, ctx, findings);
  return finish(info, findings, stats, partial, NOT_CHECKED, rules, started, now);
}

export async function scanTarball(
  chunks: AsyncIterable<Uint8Array>,
  info: RepoInfo | null,
  options: ScanOptions = {},
): Promise<ScanResult> {
  const now = options.now ?? (() => new Date());
  const started = now();
  const limits = withDefaults(options.limits);
  const stats = emptyStats();
  // Wall-clock time, independent of the (injectable) clock used for dates.
  const deadline = Date.now() + limits.timeBudgetMs;
  return scanEntries(readArchive(chunks, limits, stats, deadline), info, { ...options, stats, started, deadline });
}

/** Turn an abort of the download into a LimitExceeded the scanner reports as partial. */
async function* abortable(
  chunks: AsyncIterable<Uint8Array>,
  signal: AbortSignal,
  onAbort: () => LimitExceeded,
): AsyncGenerator<Uint8Array> {
  try {
    for await (const chunk of chunks) {
      if (signal.aborted) throw onAbort();
      yield chunk;
    }
  } catch (e) {
    if (signal.aborted && !(e instanceof LimitExceeded)) throw onAbort();
    throw e;
  }
}

async function forEachLimited<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

interface ScanJob {
  client: GitHubClient;
  info: RepoInfo;
  rules: readonly Rule[];
  ctx: ScanContext;
  limits: Limits;
  stats: ScanStats;
  findings: Finding[];
  signal: AbortSignal;
  deadline: number;
}

/** Download the files the tarball left out and scan them like the rest. */
async function scanHiddenFiles(job: ScanJob, hidden: TreeEntry[]): Promise<{ scanned: number; partial: PartialScan | null }> {
  const { client, info, limits, stats, signal } = job;
  const readSize = (e: TreeEntry) =>
    Math.min(e.size, isZipPath(e.path) ? Math.max(limits.maxFileBytes, limits.maxArchiveBytes) : limits.maxFileBytes);
  const ordered = [...hidden].sort(
    (a, b) => Number(RISKY_HIDDEN.test(b.path)) - Number(RISKY_HIDDEN.test(a.path)) || a.size - b.size,
  );
  const chosen: TreeEntry[] = [];
  let budget = limits.maxHiddenBytes;
  for (const e of ordered) {
    if (chosen.length >= limits.maxHiddenFiles) break;
    if (readSize(e) > budget) continue;
    chosen.push(e);
    budget -= readSize(e);
  }

  const entries: ArchiveEntry[] = [];
  await forEachLimited(chosen, HIDDEN_CONCURRENCY, async (e) => {
    let got: { bytes: Uint8Array; truncated: boolean };
    try {
      got = await client.fetchRaw(info, e.path, Math.max(1, readSize(e)), signal);
    } catch (err) {
      if (signal.aborted) throw err;
      return; // counted below as not scanned
    }
    if (got.truncated || e.size > got.bytes.length) stats.truncatedFiles += 1;
    const decoded = decode(got.bytes);
    if (decoded) {
      stats.textFiles += 1;
      entries.push({ kind: "text", file: { path: e.path, content: decoded.text, truncated: e.size > got.bytes.length } });
    } else {
      stats.binaryFiles += 1;
      entries.push({ kind: "binary", file: { path: e.path, head: got.bytes, size: e.size } });
    }
  });

  let partial = await collect(withArchiveContents(entries, limits, stats, job.deadline), job.rules, job.ctx, job.findings);
  const missed = hidden.length - entries.length;
  if (!partial && missed > 0) {
    // These are exactly the files someone kept out of the archive: never call the scan clean without them.
    partial = {
      limit: "maxHiddenFiles",
      limitValue: limits.maxHiddenFiles,
      reason: `${missed} of ${hidden.length} files left out of the download archive could not be scanned`,
    };
  }
  return { scanned: entries.length, partial };
}

/**
 * Compare the tarball with the commit's file list. GitHub builds tarballs
 * with "git archive", which drops files marked export-ignore in .gitattributes;
 * "git clone" still delivers them.
 */
async function checkArchiveGap(job: ScanJob, seen: Set<string>): Promise<{ check: ArchiveCheck; partial: PartialScan | null }> {
  let tree: Awaited<ReturnType<GitHubClient["listTree"]>>;
  try {
    tree = await job.client.listTree(job.info, job.signal);
  } catch (e) {
    if (job.signal.aborted) throw e;
    return { check: { status: "unavailable", hidden: 0, scanned: 0 }, partial: null };
  }
  if (tree.truncated) return { check: { status: "unavailable", hidden: 0, scanned: 0 }, partial: null };

  const hidden = tree.entries.filter((e) => e.type === "blob" && !seen.has(e.path));
  if (hidden.length === 0) return { check: { status: "ok", hidden: 0, scanned: 0 }, partial: null };

  const gapRule = job.rules.find((r) => r.id === "GR-REPO-003");
  if (gapRule) {
    job.findings.push(...runRepoRule(gapRule, job.info, { ...job.ctx, exportIgnored: hidden.map((h) => h.path) }));
  }
  const { scanned, partial } = await scanHiddenFiles(job, hidden);
  return { check: { status: "hidden", hidden: hidden.length, scanned }, partial };
}

/**
 * Scan a public GitHub repository. Every limit hit, even before the download
 * starts (size pre-check, Content-Length, time budget), gives a partial result.
 */
export async function scanRepo(ref: RepoRef, client: GitHubClient, options: ScanOptions = {}): Promise<ScanResult> {
  const now = options.now ?? (() => new Date());
  const started = now();
  const limits = withDefaults(options.limits);
  const rules = options.rules ?? allRules();
  // One wall-clock budget for the whole scan, metadata lookups included.
  const deadline = Date.now() + limits.timeBudgetMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), limits.timeBudgetMs);
  const timeLimit = () => new LimitExceeded("timeBudgetMs", limits.timeBudgetMs, "time budget for the scan ran out");
  try {
    // Without metadata there is nothing to report: a timeout here is a GitHubError.
    const info = await client.getRepoInfo(ref, controller.signal);
    const ctx = contextFor(info, started);
    const stats = emptyStats();
    const findings = rules.flatMap((rule) => runRepoRule(rule, info, ctx));
    const job: ScanJob = { client, info, rules, ctx, limits, stats, findings, signal: controller.signal, deadline };
    let partial: PartialScan | null = null;
    let archiveCheck = NOT_CHECKED;
    try {
      if (controller.signal.aborted) throw timeLimit();
      if (info.sizeKb > limits.maxRepoSizeKb) {
        throw new LimitExceeded(
          "maxRepoSizeKb",
          limits.maxRepoSizeKb,
          `repository is ${info.sizeKb} KB, limit is ${limits.maxRepoSizeKb} KB`,
        );
      }
      const seen = new Set<string>();
      const chunks = await client.streamTarball(info, limits, controller.signal);
      const tarEntries = readArchive(abortable(chunks, controller.signal, timeLimit), limits, stats, deadline, seen);
      partial = await collect(withArchiveContents(tarEntries, limits, stats, deadline), rules, ctx, findings);
      // A partial archive cannot be compared with the file list: files are missing anyway.
      if (!partial) ({ check: archiveCheck, partial } = await checkArchiveGap(job, seen));
    } catch (e) {
      if (e instanceof LimitExceeded) partial = partialFrom(e);
      else if (controller.signal.aborted) partial = partialFrom(timeLimit());
      else throw e;
    }
    return finish(info, findings, stats, partial, archiveCheck, rules, started, now);
  } finally {
    clearTimeout(timer);
  }
}
