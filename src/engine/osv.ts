/**
 * Client for OSV (osv.dev), Google's free open vulnerability database. Only
 * its malicious-package records (IDs starting with "MAL-", from the OpenSSF
 * malicious-packages project) are used: GitRay looks for malware, not for
 * ordinary vulnerabilities. Package names and versions are the only data sent.
 */

import type { Ecosystem } from "./deps";
import { ENGINE_VERSION } from "./version";

export const OSV_API_URL = "https://api.osv.dev";
const BATCH_SIZE = 1000;
const TIMEOUT_MS = 10_000;
const DETAILS_CACHE_MAX = 500;

type Fetch = typeof fetch;

export interface OsvQuery {
  ecosystem: Ecosystem;
  name: string;
  version?: string;
}

interface OsvEvent {
  introduced?: string;
  fixed?: string;
  last_affected?: string;
  limit?: string;
}

export interface OsvVuln {
  id: string;
  summary?: string;
  affected?: {
    package?: { name?: string; ecosystem?: string };
    ranges?: { type?: string; events?: OsvEvent[] }[];
    versions?: string[];
  }[];
}

export class OsvError extends Error {}

export function isMalwareId(id: string): boolean {
  return id.startsWith("MAL-");
}

/** True when the record marks every version of the package as malicious (a typosquat, not a hijacked release). */
export function affectsAllVersions(vuln: OsvVuln, name: string, ecosystem: Ecosystem): boolean {
  return (vuln.affected ?? []).some(
    (a) =>
      a.package?.ecosystem === ecosystem &&
      (a.package?.name ?? "").toLowerCase() === name.toLowerCase() &&
      (a.ranges ?? []).some((r) => {
        const events = r.events ?? [];
        return events.some((e) => e.introduced === "0") && !events.some((e) => e.fixed || e.last_affected || e.limit);
      }),
  );
}

export class OsvClient {
  private readonly fetchImpl: Fetch;
  private readonly apiUrl: string;
  private readonly details = new Map<string, OsvVuln>();

  constructor(options: { fetch?: Fetch; apiUrl?: string } = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.apiUrl = options.apiUrl ?? OSV_API_URL;
  }

  private async request(path: string, init: { body?: unknown; signal?: AbortSignal }): Promise<unknown> {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    let resp: Response;
    try {
      resp = await this.fetchImpl(`${this.apiUrl}${path}`, {
        method: init.body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", "User-Agent": `gitray/${ENGINE_VERSION}` },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal,
      });
    } catch (e) {
      throw new OsvError(`OSV request failed (${e instanceof Error ? e.name : "error"})`);
    }
    if (!resp.ok) {
      await resp.body?.cancel();
      throw new OsvError(`OSV returned HTTP ${resp.status}`);
    }
    try {
      return await resp.json();
    } catch {
      throw new OsvError("Invalid JSON from OSV");
    }
  }

  /** IDs of the records that match each query, in order. */
  async queryBatch(queries: OsvQuery[], signal?: AbortSignal): Promise<string[][]> {
    const out: string[][] = [];
    for (let i = 0; i < queries.length; i += BATCH_SIZE) {
      const chunk = queries.slice(i, i + BATCH_SIZE);
      const body = {
        queries: chunk.map((q) => ({
          package: { name: q.name, ecosystem: q.ecosystem },
          ...(q.version ? { version: q.version } : {}),
        })),
      };
      const data = (await this.request("/v1/querybatch", { body, signal })) as { results?: { vulns?: { id?: unknown }[] }[] };
      const results = Array.isArray(data?.results) ? data.results : [];
      if (results.length !== chunk.length) throw new OsvError("Unexpected OSV batch response");
      for (const r of results) {
        out.push((Array.isArray(r?.vulns) ? r.vulns : []).map((v) => v?.id).filter((id): id is string => typeof id === "string"));
      }
    }
    return out;
  }

  async getVuln(id: string, signal?: AbortSignal): Promise<OsvVuln> {
    const cached = this.details.get(id);
    if (cached) return cached;
    if (!/^[A-Za-z0-9.-]{1,100}$/.test(id)) throw new OsvError("Invalid OSV id");
    const data = (await this.request(`/v1/vulns/${encodeURIComponent(id)}`, { signal })) as OsvVuln;
    if (typeof data?.id !== "string") throw new OsvError("Unexpected OSV record");
    if (this.details.size >= DETAILS_CACHE_MAX) this.details.clear();
    this.details.set(id, data);
    return data;
  }
}
