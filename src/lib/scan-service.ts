/**
 * Server-side glue between the HTTP API and the engine: input validation,
 * caching, best-effort rate limiting and error mapping.
 *
 * Two cache levels: a short per-instance memory cache and the database
 * (scan-store.ts, 1 hour, shared by every instance). "Scan again now" (fresh)
 * skips both, except for a scan that is less than a minute old. Serverless
 * instances come and go, so the rate limiter is per instance.
 */

import {
  ArchiveError,
  GitHubClient,
  GitHubError,
  InvalidTarget,
  type Limits,
  type Report,
  parseTarget,
  scanRepo,
  toReport,
} from "@/engine";

import { logError } from "./log";
import { type ScanStore, getScanStore, repoKey } from "./scan-store";

/** Memory cache lifetime. Short, so a rescan on another instance shows up quickly. */
export const CACHE_TTL_MS = 60 * 1000;
/** A stored scan younger than this is served instead of scanning again. */
export const STORE_TTL_MS = 60 * 60 * 1000;
/** "Scan again now" returns the current result if it is younger than this. */
export const FRESH_COOLDOWN_MS = 60 * 1000;
const CACHE_MAX = 200;
export const RATE_WINDOW_MS = 60 * 1000;
/** New scans per client per minute (each costs about 5 GitHub API requests). */
export const RATE_MAX = 6;
/** Uncached lookups per client per minute (each costs a database query). */
export const LOOKUP_MAX = 60;
const MAX_CONCURRENT = 4;
const MAX_TRACKED_CLIENTS = 10_000;

export interface ApiError {
  error: { code: string; message: string };
}

export interface ScanOutcome {
  status: number;
  body: Report | ApiError;
  cached: boolean;
}

export interface Deps {
  client: () => GitHubClient;
  now: () => number;
  store: () => ScanStore;
  limits?: Partial<Limits>;
}

const defaultDeps: Deps = {
  client: () => new GitHubClient({ token: process.env.GITHUB_TOKEN || undefined }),
  now: () => Date.now(),
  store: getScanStore,
};

const cache = new Map<string, { report: Report; expires: number }>();
const limiters = { scan: new Map<string, number[]>(), lookup: new Map<string, number[]>() };
let running = 0;

export function resetScanService(): void {
  clearScanCache();
  limiters.scan.clear();
  limiters.lookup.clear();
  running = 0;
}

/** Empty the memory cache only (as on a new serverless instance that shares a client). */
export function clearScanCache(): void {
  cache.clear();
}

function fail(status: number, code: string, message: string): ScanOutcome {
  return { status, body: { error: { code, message } }, cached: false };
}

/** Expand "2001:db8::1" to its eight groups. */
function ipv6Groups(ip: string): string[] | null {
  const [head, tail, ...rest] = ip.split("::");
  if (rest.length) return null;
  const left = head ? head.split(":") : [];
  const right = tail !== undefined && tail !== "" ? tail.split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (tail === undefined && missing !== 0)) return null;
  return [...left, ...Array<string>(missing).fill("0"), ...right];
}

/**
 * The identity a limit applies to. IPv6 clients usually own a whole /64, so
 * rotating addresses inside it must not reset their limit.
 */
export function clientKey(ip: string): string {
  if (!ip.includes(":")) return ip;
  const groups = ipv6Groups(ip.toLowerCase().split("%")[0]);
  return groups ? `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64` : ip;
}

function limited(bucket: Map<string, number[]>, client: string, max: number, now: number): boolean {
  const recent = (bucket.get(client) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= max) {
    bucket.set(client, recent);
    return true;
  }
  recent.push(now);
  bucket.delete(client);
  bucket.set(client, recent);
  // Forget the least recently active clients instead of resetting everyone.
  while (bucket.size > MAX_TRACKED_CLIENTS) {
    const oldest = bucket.keys().next().value;
    if (oldest === undefined) break;
    bucket.delete(oldest);
  }
  return false;
}

function cached(key: string, now: number, maxAgeMs = Number.POSITIVE_INFINITY): Report | null {
  const hit = cache.get(key);
  if (!hit || hit.expires <= now) return null;
  return now - Date.parse(hit.report.startedAt) < maxAgeMs ? hit.report : null;
}

function remember(key: string, report: Report, now: number): void {
  // Never keep a report in memory longer than it would be served from the database.
  const expires = Math.min(now + CACHE_TTL_MS, Date.parse(report.startedAt) + STORE_TTL_MS);
  if (expires <= now) return;
  cache.delete(key);
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { report, expires });
}

async function fromStore(store: ScanStore, key: string, since: Date): Promise<Report | null> {
  try {
    return await store.fresh(key, since);
  } catch (e) {
    logError("scan store read failed", e);
    return null;
  }
}

/** Results cut short by the time budget say more about GitHub's speed than the repository. */
function worthKeeping(report: Report): boolean {
  return report.partial?.limit !== "timeBudgetMs";
}

export interface ScanRequest {
  /** Scan again even if a recent result exists (results younger than a minute are reused). */
  fresh?: boolean;
}

export async function runScan(
  raw: string,
  ip: string,
  deps: Deps = defaultDeps,
  request: ScanRequest = {},
): Promise<ScanOutcome> {
  let ref;
  try {
    ref = parseTarget(raw);
  } catch (e) {
    if (e instanceof InvalidTarget) return fail(400, "invalid_target", e.message);
    throw e;
  }
  const key = repoKey(`${ref.owner}/${ref.repo}`);
  const client = clientKey(ip);
  const now = deps.now();
  const store = deps.store();
  const maxAge = request.fresh ? FRESH_COOLDOWN_MS : STORE_TTL_MS;

  const inMemory = cached(key, now, maxAge);
  if (inMemory) return { status: 200, body: inMemory, cached: true };

  if (store.configured) {
    if (limited(limiters.lookup, client, LOOKUP_MAX, now)) {
      return fail(429, "rate_limited", "Too many requests. Please wait a moment.");
    }
    const stored = await fromStore(store, key, new Date(now - maxAge));
    if (stored) {
      remember(key, stored, now);
      return { status: 200, body: stored, cached: true };
    }
  }

  if (running >= MAX_CONCURRENT) return fail(503, "busy", "The scanner is busy right now.");
  if (limited(limiters.scan, client, RATE_MAX, now)) {
    return fail(429, "rate_limited", `At most ${RATE_MAX} scans per minute. Please wait a moment.`);
  }

  running += 1;
  try {
    const report = toReport(await scanRepo(ref, deps.client(), { limits: deps.limits }));
    if (worthKeeping(report)) {
      remember(key, report, deps.now());
      if (report.target) remember(repoKey(report.target.fullName), report, deps.now());
      try {
        await store.save(report);
      } catch (e) {
        // The scan itself succeeded; the lists just miss this entry.
        logError("scan store write failed", e);
      }
    }
    return { status: 200, body: report, cached: false };
  } catch (e) {
    if (e instanceof GitHubError) {
      const status = { not_found: 404, private: 403, rate_limited: 429, upstream: 502 }[e.code];
      return fail(status, e.code, e.message);
    }
    if (e instanceof ArchiveError) return fail(422, "archive_error", `Could not read the repository archive: ${e.message}`);
    logError("scan failed", e);
    return fail(500, "internal", "Unexpected error while scanning.");
  } finally {
    running -= 1;
  }
}
