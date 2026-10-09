/**
 * Scan orchestration: repository metadata -> tarball (and the ZIPs inside it)
 * -> files missing from the tarball -> dependencies against OSV -> committed
 * programs and release assets against VirusTotal -> rules -> score.
 */

import { type ArchiveEntry, readArchive } from "./archive";
import { DependencyIndex, isManifest, parseManifest } from "./deps";
import { LimitExceeded } from "./errors";
import type { GitHubClient, TreeEntry } from "./github";
import { type Limits, withDefaults } from "./limits";
import { type OsvClient, affectsAllVersions, isMalwareId } from "./osv";
import { type Rule, allRules } from "./rules";
import { runBinaryRule, runRepoRule, runTextRule } from "./rules/base";
import { executableKind } from "./rules/binary";
import { score } from "./scoring";
import { type Submodule, parseGitmodules } from "./submodules";
import { decode, isTestPath } from "./text";
import {
  type ArchiveCheck,
  type Category,
  type CheckedFile,
  type DependencyCheck,
  type Finding,
  type MaliciousDependency,
  type PartialScan,
  type RepoInfo,
  type RepoRef,
  type ReputationCheck,
  type ScanContext,
  type ScanResult,
  type ScanStats,
  emptyStats,
} from "./types";
import { type Reputation, type ReputationService, isSha256 } from "./virustotal";
import { ARCHIVE_SEPARATOR, isZipPath, withArchiveContents } from "./zip";

export interface ScanOptions {
  limits?: Partial<Limits>;
  rules?: readonly Rule[];
  /** Injectable clock for tests. */
  now?: () => Date;
  /** Checks declared dependencies against OSV's malicious-package records when given. */
  osv?: OsvClient;
  /** Looks up committed programs and release assets on VirusTotal when given. */
  reputation?: ReputationService;
}

const NOT_CHECKED: ArchiveCheck = { status: "skipped", hidden: 0, scanned: 0 };
const DEPENDENCIES_NOT_CHECKED: DependencyCheck = { status: "skipped", packages: 0, malicious: 0 };
const REPUTATION_NOT_CHECKED: ReputationCheck = { status: "none", files: [] };
/** Committed programs fingerprinted per scan (the lookups themselves are limited separately). */
const MAX_EXECUTABLES = 100;
/** OSV records fetched per scan to tell typosquats (all versions) from hijacked releases. */
const MAX_OSV_DETAIL_LOOKUPS = 20;
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
/** What collect() gathers besides findings. */
interface Gathered {
  deps?: DependencyIndex;
  submodules: Submodule[];
  /** SHA-256 of programs read whole (PE, ELF, Mach-O), for VirusTotal. */
  executables: { path: string; sha256: string }[];
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Our buffers are never shared memory; the cast only satisfies BufferSource.
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function collect(
  entries: AsyncIterable<ArchiveEntry>,
  rules: readonly Rule[],
  ctx: ScanContext,
  findings: Finding[],
  gathered: Gathered,
): Promise<PartialScan | null> {
  try {
    for await (const entry of entries) {
      findings.push(...scanEntry(entry, rules, ctx));
      if (entry.kind === "binary") {
        const { head, size, path } = entry.file;
        if (head.length === size && gathered.executables.length < MAX_EXECUTABLES && executableKind(head) !== null) {
          gathered.executables.push({ path, sha256: await sha256Hex(head) });
        }
        continue;
      }
      if (gathered.deps && isManifest(entry.file.path)) {
        gathered.deps.add(parseManifest(entry.file.path, entry.file.content));
      }
      // Only the top-level .gitmodules counts for git; ZIP members are never named this way.
      if (entry.file.path === ".gitmodules") {
        const owner = ctx.info?.fullName.split("/")[0] ?? ctx.repo?.owner ?? null;
        gathered.submodules.push(...parseGitmodules(entry.file.content, owner));
      }
    }
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
  checks: {
    archiveCheck: ArchiveCheck;
    dependencyCheck: DependencyCheck;
    submodules: Submodule[];
    reputationCheck: ReputationCheck;
  },
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
    testFilesCapped: scored.testFilesCapped,
    stats,
    partial,
    ...checks,
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
  const gathered: Gathered = { submodules: [], executables: [] };
  const partial = await collect(withArchiveContents(entries, limits, stats, options.deadline), rules, ctx, findings, gathered);
  const checks = {
    archiveCheck: NOT_CHECKED,
    dependencyCheck: DEPENDENCIES_NOT_CHECKED,
    submodules: gathered.submodules,
    reputationCheck: REPUTATION_NOT_CHECKED,
  };
  return finish(info, findings, stats, partial, checks, rules, started, now);
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
  gathered: Gathered & { deps: DependencyIndex };
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

  let partial = await collect(
    withArchiveContents(entries, limits, stats, job.deadline),
    job.rules,
    job.ctx,
    job.findings,
    job.gathered,
  );
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
 * Ask OSV about every declared package. Exact versions (lockfiles) are matched
 * directly; packages declared only by range count when a malicious-package
 * record covers every version (a typosquat), not when only some releases were
 * hijacked, since the version that would be installed is unknown.
 */
async function checkDependencies(job: ScanJob, osv: OsvClient | undefined): Promise<DependencyCheck> {
  const { deps } = job.gathered;
  if (deps.size === 0) return { status: "none", packages: 0, malicious: 0 };
  if (!osv) return { status: "skipped", packages: deps.size, malicious: 0 };
  const queries = deps.queries().slice(0, job.limits.maxDependencyQueries);
  let results: string[][];
  try {
    results = await osv.queryBatch(queries, job.signal);
  } catch {
    // A missing extra check must not turn a finished scan into an error.
    return { status: "unavailable", packages: deps.size, malicious: 0 };
  }

  const found: MaliciousDependency[] = [];
  let lookups = 0;
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    const ids = results[i].filter(isMalwareId);
    if (ids.length === 0) continue;
    if (!q.version) {
      let everyVersion = false;
      for (const id of ids) {
        if (lookups >= MAX_OSV_DETAIL_LOOKUPS) break;
        lookups += 1;
        try {
          everyVersion = affectsAllVersions(await osv.getVuln(id, job.signal), q.name, q.ecosystem);
        } catch {
          everyVersion = false;
        }
        if (everyVersion) break;
      }
      if (!everyVersion) continue;
    }
    const sites = deps.sitesOf(q.ecosystem, q.name);
    const site = sites.find((s) => s.version === (q.version ?? null)) ?? sites[0];
    if (!site) continue;
    found.push({ ecosystem: q.ecosystem, name: q.name, version: q.version ?? null, ids, path: site.path, line: site.line, text: site.text });
  }
  const rule = job.rules.find((r) => r.id === "GR-DEP-001");
  if (rule && found.length) job.findings.push(...runRepoRule(rule, job.info, { ...job.ctx, maliciousDependencies: found }));
  return { status: found.length ? "found" : "ok", packages: deps.size, malicious: found.length };
}

/** Release files that are documentation, checksums or signatures, not programs or archives. */
const NOT_A_PROGRAM = /\.(?:sha(?:1|256|512)(?:sum)?|md5|sig|asc|minisig|sigstore(?:\.json)?|pem|crt|pub|sbom|spdx|cdx\.json|intoto\.jsonl|json|txt|md|html)$/i;
const PROGRAM_OR_ARCHIVE =
  /\.(?:exe|msi|msix|scr|dll|com|bat|cmd|ps1|vbs|lnk|hta|zip|7z|rar|iso|img|dmg|pkg|apk|appimage|deb|rpm|jar|tgz|tar\.gz|tar\.xz)$/i;

/**
 * What to look up, most telling first: programs committed outside tests, then
 * the newest releases' programs and archives, then other release files, then
 * programs in tests. Each fingerprint once.
 */
function reputationCandidates(job: ScanJob): Omit<CheckedFile, "reputation">[] {
  const repoFiles = job.gathered.executables.map((e) => ({ source: "repository" as const, name: e.path, sha256: e.sha256 }));
  const releases = job.info.releaseAssets
    .map((a) => ({ a, sha: /^sha256:([0-9a-f]{64})$/i.exec(a.digest ?? "")?.[1]?.toLowerCase() }))
    .filter(({ a, sha }) => sha && !NOT_A_PROGRAM.test(a.name))
    .map(({ a, sha }) => ({ source: "release" as const, name: `${a.releaseTag}/${a.name}`, sha256: sha!, risky: PROGRAM_OR_ARCHIVE.test(a.name) }));
  const ordered = [
    ...repoFiles.filter((f) => !isTestPath(f.name)),
    ...releases.filter((r) => r.risky),
    ...releases.filter((r) => !r.risky),
    ...repoFiles.filter((f) => isTestPath(f.name)),
  ];
  const seen = new Set<string>();
  const out: Omit<CheckedFile, "reputation">[] = [];
  for (const { source, name, sha256 } of ordered) {
    if (seen.has(sha256) || !isSha256(sha256)) continue;
    seen.add(sha256);
    out.push({ source, name, sha256 });
  }
  return out;
}

async function checkReputation(job: ScanJob, service: ReputationService | undefined): Promise<ReputationCheck> {
  const candidates = reputationCandidates(job);
  if (candidates.length === 0) return { status: "none", files: [] };
  if (!service) return { status: "not_configured", files: [] };
  const looked = candidates.slice(0, job.limits.maxReputationLookups);
  let results: Map<string, Reputation>;
  try {
    results = await service.lookup(
      looked.map((c) => c.sha256),
      job.signal,
    );
  } catch {
    // A missing extra check must not turn a finished scan into an error.
    return { status: "unavailable", files: [] };
  }
  const files: CheckedFile[] = [
    ...looked.map((c) => ({ ...c, reputation: results.get(c.sha256) ?? { status: "skipped" as const, reason: "error" as const } })),
    ...candidates.slice(looked.length).map((c) => ({ ...c, reputation: { status: "skipped" as const, reason: "limit" as const } })),
  ];
  const flagged = files.filter((f) => f.reputation.status === "found" && f.reputation.stats.malicious > 0);
  const rule = job.rules.find((r) => r.id === "GR-BIN-003");
  if (rule && flagged.length) job.findings.push(...runRepoRule(rule, job.info, { ...job.ctx, flaggedFiles: flagged }));
  const skipped = files.some((f) => f.reputation.status === "skipped");
  return { status: flagged.length ? "found" : skipped ? "partial" : "ok", files };
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
    const gathered = { deps: new DependencyIndex(), submodules: [] as Submodule[], executables: [] as Gathered["executables"] };
    const job: ScanJob = { client, info, rules, ctx, limits, stats, findings, signal: controller.signal, deadline, gathered };
    let partial: PartialScan | null = null;
    let archiveCheck = NOT_CHECKED;
    let dependencyCheck = DEPENDENCIES_NOT_CHECKED;
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
      partial = await collect(withArchiveContents(tarEntries, limits, stats, deadline), rules, ctx, findings, gathered);
      // A partial archive cannot be compared with the file list: files are missing anyway.
      if (!partial) ({ check: archiveCheck, partial } = await checkArchiveGap(job, seen));
      dependencyCheck = await checkDependencies(job, options.osv);
    } catch (e) {
      if (e instanceof LimitExceeded) partial = partialFrom(e);
      else if (controller.signal.aborted) partial = partialFrom(timeLimit());
      else throw e;
    }
    // Release assets can be looked up even when a limit stopped the archive scan.
    const reputationCheck = controller.signal.aborted ? REPUTATION_NOT_CHECKED : await checkReputation(job, options.reputation);
    const checks = { archiveCheck, dependencyCheck, submodules: gathered.submodules, reputationCheck };
    return finish(info, findings, stats, partial, checks, rules, started, now);
  } finally {
    clearTimeout(timer);
  }
}
