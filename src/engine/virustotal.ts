/**
 * File reputation from VirusTotal (free public API, an API key is required).
 * Only SHA-256 fingerprints are sent: of programs committed to the repository
 * and of release assets (GitHub reports their digest). Nothing is uploaded and
 * no release file is ever downloaded.
 *
 * A file VirusTotal has never seen is "unknown", never "clean".
 */

import { ENGINE_VERSION } from "./version";

export const VIRUSTOTAL_API_URL = "https://www.virustotal.com/api/v3";
const TIMEOUT_MS = 10_000;
const SHA256 = /^[0-9a-f]{64}$/;

type Fetch = typeof fetch;

/** How many antivirus engines put the file in each category on its last analysis. */
export interface DetectionStats {
  malicious: number;
  suspicious: number;
  harmless: number;
  undetected: number;
}

export type Reputation =
  | { status: "found"; stats: DetectionStats }
  /** VirusTotal has never analyzed this file: not evidence either way. */
  | { status: "unknown" }
  /** Not looked up: the shared quota ran out, the lookup failed, or the per-scan limit was reached. */
  | { status: "skipped"; reason: "quota" | "error" | "limit" };

/** Looks up many fingerprints; implementations add caching and quotas (src/lib/virustotal.ts). */
export interface ReputationService {
  lookup(sha256s: readonly string[], signal?: AbortSignal): Promise<Map<string, Reputation>>;
}

export class VirusTotalError extends Error {
  constructor(
    message: string,
    readonly kind: "quota" | "auth" | "other",
  ) {
    super(message);
  }
}

export function isSha256(value: string): boolean {
  return SHA256.test(value);
}

function count(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

export class VirusTotalClient {
  private readonly fetchImpl: Fetch;
  private readonly apiUrl: string;

  constructor(
    private readonly apiKey: string,
    options: { fetch?: Fetch; apiUrl?: string } = {},
  ) {
    this.fetchImpl = options.fetch ?? fetch;
    this.apiUrl = options.apiUrl ?? VIRUSTOTAL_API_URL;
  }

  /** One file report. Errors never contain the API key. */
  async file(sha256: string, signal?: AbortSignal): Promise<Reputation> {
    if (!isSha256(sha256)) throw new VirusTotalError("Invalid SHA-256", "other");
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await this.fetchImpl(`${this.apiUrl}/files/${sha256}`, {
        headers: { "x-apikey": this.apiKey, accept: "application/json", "User-Agent": `gitray/${ENGINE_VERSION}` },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch (e) {
      throw new VirusTotalError(`VirusTotal request failed (${e instanceof Error ? e.name : "error"})`, "other");
    }
    if (resp.status === 404) {
      await resp.body?.cancel();
      return { status: "unknown" };
    }
    if (!resp.ok) {
      await resp.body?.cancel();
      const kind = resp.status === 429 ? "quota" : resp.status === 401 || resp.status === 403 ? "auth" : "other";
      throw new VirusTotalError(`VirusTotal returned HTTP ${resp.status}`, kind);
    }
    let body: unknown;
    try {
      body = await resp.json();
    } catch {
      throw new VirusTotalError("Invalid JSON from VirusTotal", "other");
    }
    const stats = (body as { data?: { attributes?: { last_analysis_stats?: Record<string, unknown> } } })?.data?.attributes
      ?.last_analysis_stats;
    if (!stats || typeof stats !== "object") throw new VirusTotalError("Unexpected VirusTotal response", "other");
    return {
      status: "found",
      stats: {
        malicious: count(stats.malicious),
        suspicious: count(stats.suspicious),
        harmless: count(stats.harmless),
        undetected: count(stats.undetected),
      },
    };
  }
}
