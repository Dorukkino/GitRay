/**
 * Server-side glue between the HTTP API and the engine: input validation, a
 * small in-memory cache, best-effort rate limiting and error mapping.
 *
 * Serverless instances come and go, so the cache and the limiter are per
 * instance. A shared store (PostgreSQL) is planned for a later stage.
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

export const CACHE_TTL_MS = 10 * 60 * 1000;
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

interface Deps {
  client: () => GitHubClient;
  now: () => number;
}

const defaultDeps: Deps = {
  client: () => new GitHubClient({ token: process.env.GITHUB_TOKEN || undefined }),
  now: () => Date.now(),
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

export async function runScan(raw: string, ip: string, deps: Deps = defaultDeps): Promise<ScanOutcome> {
  let ref;
  try {
    ref = parseTarget(raw);
  } catch (e) {
    if (e instanceof InvalidTarget) return fail(400, "invalid_target", e.message);
    throw e;
  }
  const key = `${ref.owner}/${ref.repo}`.toLowerCase();
  const now = deps.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return { status: 200, body: hit.report, cached: true };

  if (rateLimited(ip, now)) {
    return fail(429, "rate_limited", `At most ${RATE_MAX} scans per minute. Please wait a moment.`);
  }
  if (running >= MAX_CONCURRENT) return fail(503, "busy", "The scanner is busy right now.");

  running += 1;
  try {
    const report = toReport(await scanRepo(ref, deps.client()));
    remember(key, report, deps.now());
    if (report.target) remember(report.target.fullName.toLowerCase(), report, deps.now());
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
