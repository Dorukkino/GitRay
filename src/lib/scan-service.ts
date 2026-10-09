/**
 * Server-side glue between the HTTP API and the engine: input validation,
 * caching, best-effort rate limiting and error mapping.
 *
 * Two cache levels: a per-instance memory cache (10 minutes) and the database
 * (scan-store.ts, 1 hour, shared by every instance). Serverless instances come
 * and go, so the rate limiter is per instance.
 */

import {
  ArchiveError,
  GitHubClient,
  GitHubError,
  InvalidTarget,
  type Report,
  parseTarget,
  scanRepo,
  toReport,
} from "@/engine";

import { type ScanStore, getScanStore, repoKey } from "./scan-store";

export const CACHE_TTL_MS = 10 * 60 * 1000;
/** A stored scan younger than this is served instead of scanning again (unless fresh is asked). */
export const STORE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 200;
export const RATE_WINDOW_MS = 60 * 1000;
export const RATE_MAX = 6;
const MAX_CONCURRENT = 4;

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
}

const defaultDeps: Deps = {
  client: () => new GitHubClient({ token: process.env.GITHUB_TOKEN || undefined }),
  now: () => Date.now(),
  store: getScanStore,
};

const cache = new Map<string, { report: Report; expires: number }>();
const hits = new Map<string, number[]>();
let running = 0;

export function resetScanService(): void {
  cache.clear();
  hits.clear();
  running = 0;
}

function fail(status: number, code: string, message: string): ScanOutcome {
  return { status, body: { error: { code, message } }, cached: false };
}

function rateLimited(ip: string, now: number): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 10_000) hits.clear();
  return false;
}

function remember(key: string, report: Report, now: number): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { report, expires: now + CACHE_TTL_MS });
}

export interface ScanRequest {
  /** Skip both caches and scan the repository again. */
  fresh?: boolean;
}

async function fromStore(store: ScanStore, key: string, since: Date): Promise<Report | null> {
  try {
    return await store.fresh(key, since);
  } catch (e) {
    console.error("scan store read failed", e instanceof Error ? e.message : e);
    return null;
  }
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
  const now = deps.now();
  const store = deps.store();
  if (!request.fresh) {
    const hit = cache.get(key);
    if (hit && hit.expires > now) return { status: 200, body: hit.report, cached: true };
    const stored = await fromStore(store, key, new Date(now - STORE_TTL_MS));
    if (stored) {
      remember(key, stored, now);
      return { status: 200, body: stored, cached: true };
    }
  }

  if (rateLimited(ip, now)) {
    return fail(429, "rate_limited", `At most ${RATE_MAX} scans per minute. Please wait a moment.`);
  }
  if (running >= MAX_CONCURRENT) return fail(503, "busy", "The scanner is busy right now.");

  running += 1;
  try {
    const report = toReport(await scanRepo(ref, deps.client()));
    remember(key, report, deps.now());
    if (report.target) remember(repoKey(report.target.fullName), report, deps.now());
    try {
      await store.save(report);
    } catch (e) {
      // The scan itself succeeded; the lists just miss this entry.
      console.error("scan store write failed", e instanceof Error ? e.message : e);
    }
    return { status: 200, body: report, cached: false };
  } catch (e) {
    if (e instanceof GitHubError) {
      const status = { not_found: 404, private: 403, rate_limited: 429, upstream: 502 }[e.code];
      return fail(status, e.code, e.message);
    }
    if (e instanceof ArchiveError) return fail(422, "archive_error", `Could not read the repository archive: ${e.message}`);
    console.error("scan failed", e instanceof Error ? e.message : e);
    return fail(500, "internal", "Unexpected error while scanning.");
  } finally {
    running -= 1;
  }
}
