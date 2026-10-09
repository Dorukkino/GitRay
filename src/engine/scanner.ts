/** Scan orchestration: repository metadata -> tarball -> rules -> score. */

import { type ArchiveEntry, readArchive } from "./archive";
import { LimitExceeded } from "./errors";
import type { GitHubClient } from "./github";
import { type Limits, withDefaults } from "./limits";
import { type Rule, allRules } from "./rules";
import { runBinaryRule, runRepoRule, runTextRule } from "./rules/base";
import { score } from "./scoring";
import {
  type Finding,
  type PartialScan,
  type RepoInfo,
  type RepoRef,
  type ScanContext,
  type ScanResult,
  type ScanStats,
  emptyStats,
} from "./types";

export interface ScanOptions {
  limits?: Partial<Limits>;
  rules?: readonly Rule[];
  /** Injectable clock for tests. */
  now?: () => Date;
}

function contextFor(info: RepoInfo | null, now: Date): ScanContext {
  if (!info) return { repo: null, info: null, now };
  const [owner, repo] = info.fullName.split("/");
  return { repo: { owner, repo }, info, now };
}

export function scanEntry(entry: ArchiveEntry, rules: readonly Rule[], ctx: ScanContext): Finding[] {
  const findings: Finding[] = [];
  for (const rule of rules) {
    findings.push(
      ...(entry.kind === "text" ? runTextRule(rule, entry.file, ctx) : runBinaryRule(rule, entry.file, ctx)),
    );
  }
  return findings;
}

function partialFrom(e: LimitExceeded): PartialScan {
  return { limit: e.limit, limitValue: e.value, reason: e.message };
}

function finish(
  info: RepoInfo | null,
  findings: Finding[],
  stats: ScanStats,
  partial: PartialScan | null,
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
    rulesRun: rules.map((r) => r.id),
    startedAt: started.toISOString(),
    durationMs: Math.max(0, now().getTime() - started.getTime()),
  };
}

/**
 * Scan a stream of archive entries (or a gzipped tarball). A limit hit
 * mid-archive gives a partial result instead of an error.
 */
export async function scanEntries(
  entries: AsyncIterable<ArchiveEntry> | Iterable<ArchiveEntry>,
  info: RepoInfo | null,
  options: ScanOptions & { stats?: ScanStats; started?: Date } = {},
): Promise<ScanResult> {
  const now = options.now ?? (() => new Date());
  const started = options.started ?? now();
  const rules = options.rules ?? allRules();
  const stats = options.stats ?? emptyStats();
  const ctx = contextFor(info, started);
  const findings: Finding[] = [];
  if (info) for (const rule of rules) findings.push(...runRepoRule(rule, info, ctx));
  let partial: PartialScan | null = null;
  try {
    for await (const entry of entries) findings.push(...scanEntry(entry, rules, ctx));
  } catch (e) {
    if (!(e instanceof LimitExceeded)) throw e;
    partial = partialFrom(e);
  }
  return finish(info, findings, stats, partial, rules, started, now);
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
  return scanEntries(readArchive(chunks, limits, stats, deadline), info, { ...options, stats, started });
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
  // Wall-clock time, independent of the (injectable) clock used for dates.
  const deadline = Date.now() + limits.timeBudgetMs;
  const info = await client.getRepoInfo(ref);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(0, deadline - Date.now()));
  const stats = emptyStats();
  const timeLimit = () => new LimitExceeded("timeBudgetMs", limits.timeBudgetMs, "time budget for the scan ran out");
  try {
    if (info.sizeKb > limits.maxRepoSizeKb) {
      throw new LimitExceeded(
        "maxRepoSizeKb",
        limits.maxRepoSizeKb,
        `repository is ${info.sizeKb} KB, limit is ${limits.maxRepoSizeKb} KB`,
      );
    }
    const chunks = await client.streamTarball(info, limits, controller.signal);
    return await scanEntries(readArchive(abortable(chunks, controller.signal, timeLimit), limits, stats, deadline), info, {
      ...options,
      rules,
      stats,
      started,
    });
  } catch (e) {
    // Raised before any file was read: size pre-check, Content-Length, or the
    // time budget running out while GitHub prepared the download.
    let limit: LimitExceeded;
    if (e instanceof LimitExceeded) limit = e;
    else if (controller.signal.aborted) limit = timeLimit();
    else throw e;
    const ctx = contextFor(info, started);
    const findings = rules.flatMap((rule) => runRepoRule(rule, info, ctx));
    return finish(info, findings, stats, partialFrom(limit), rules, started, now);
  } finally {
    clearTimeout(timer);
  }
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
