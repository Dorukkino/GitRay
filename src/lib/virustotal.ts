/**
 * VirusTotal lookups for the site. The free public API allows 4 requests a
 * minute and 500 a day for the whole key, so every instance shares one quota
 * (rate-store.ts) and every answer is kept for a day (Postgres; memory without
 * a database), so repeat scans cost nothing. Without VIRUSTOTAL_API_KEY the
 * check is off and reports keep plain VirusTotal links.
 */

import { type Reputation, type ReputationService, VirusTotalClient, VirusTotalError } from "@/engine";

import { type Db, databaseUrl, neonDb } from "./db";
import { logError } from "./log";
import { MemoryRateStore, type RateStore, getRateStore } from "./rate-store";

export const VT_PER_MINUTE = 4;
export const VT_PER_DAY = 500;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** How long an answer is reused. Detections change, so not forever. */
export const VT_CACHE_MS = DAY_MS;
/** Live requests one scan may spend; cached answers are free. */
export const VT_LIVE_PER_SCAN = VT_PER_MINUTE;

export interface ReputationCache {
  get(sha256: string, now: number): Promise<Reputation | null>;
  set(sha256: string, reputation: Reputation, now: number): Promise<void>;
}

/** Postgres codes raised when two instances create the same table at the same time. */
const ALREADY_EXISTS = new Set(["23505", "42P07", "42710"]);
/** One write in this many also deletes old rows. */
const PRUNE_EVERY = 100;

export class PostgresReputationCache implements ReputationCache {
  private schema: Promise<void> | null = null;

  constructor(
    private readonly db: Db,
    private readonly random: () => number = Math.random,
  ) {}

  private ensureSchema(): Promise<void> {
    this.schema ??= this.db
      .query(
        `CREATE TABLE IF NOT EXISTS virustotal_cache (
          sha256     text PRIMARY KEY,
          result     jsonb NOT NULL,
          checked_at timestamptz NOT NULL
        )`,
      )
      .then(
        () => undefined,
        (e) => {
          const code = typeof e === "object" && e !== null && "code" in e ? String(e.code) : "";
          if (!ALREADY_EXISTS.has(code)) throw e;
        },
      )
      .catch((e) => {
        this.schema = null;
        throw e;
      });
    return this.schema;
  }

  async get(sha256: string, now: number): Promise<Reputation | null> {
    await this.ensureSchema();
    const rows = await this.db.query<{ result: unknown }>(
      "SELECT result FROM virustotal_cache WHERE sha256 = $1 AND checked_at > $2::timestamptz",
      [sha256, new Date(now - VT_CACHE_MS).toISOString()],
    );
    const raw = rows[0]?.result;
    const value = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
    return isStoredReputation(value) ? value : null;
  }

  async set(sha256: string, reputation: Reputation, now: number): Promise<void> {
    await this.ensureSchema();
    await this.db.query(
      `INSERT INTO virustotal_cache (sha256, result, checked_at) VALUES ($1, $2::jsonb, $3::timestamptz)
       ON CONFLICT (sha256) DO UPDATE SET result = EXCLUDED.result, checked_at = EXCLUDED.checked_at`,
      [sha256, JSON.stringify(reputation), new Date(now).toISOString()],
    );
    if (this.random() < 1 / PRUNE_EVERY) {
      await this.db.query("DELETE FROM virustotal_cache WHERE checked_at < $1::timestamptz", [
        new Date(now - 7 * DAY_MS).toISOString(),
      ]);
    }
  }
}

export class MemoryReputationCache implements ReputationCache {
  private readonly entries = new Map<string, { reputation: Reputation; at: number }>();

  async get(sha256: string, now: number): Promise<Reputation | null> {
    const e = this.entries.get(sha256);
    return e && now - e.at < VT_CACHE_MS ? e.reputation : null;
  }

  async set(sha256: string, reputation: Reputation, now: number): Promise<void> {
    if (this.entries.size >= 1_000) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(sha256, { reputation, at: now });
  }
}

/** Only real answers are stored; "skipped" is never cached. */
function isStoredReputation(v: unknown): v is Reputation {
  if (typeof v !== "object" || v === null) return false;
  const r = v as { status?: unknown; stats?: Record<string, unknown> };
  if (r.status === "unknown") return true;
  return (
    r.status === "found" &&
    typeof r.stats === "object" &&
    r.stats !== null &&
    ["malicious", "suspicious", "harmless", "undetected"].every((k) => typeof r.stats![k] === "number")
  );
}

export class VirusTotalReputation implements ReputationService {
  private readonly fallbackRates = new MemoryRateStore();

  constructor(
    private readonly client: VirusTotalClient,
    private readonly rates: RateStore,
    private readonly cache: ReputationCache,
    private readonly now: () => number = Date.now,
  ) {}

  /** Count one request against the shared minute and day quotas. */
  private async reserve(): Promise<boolean> {
    const hit = async (bucket: string, windowMs: number) => {
      try {
        return await this.rates.hit(bucket, "site", windowMs, this.now());
      } catch (e) {
        logError("virustotal quota store failed", e);
        return this.fallbackRates.hit(bucket, "site", windowMs, this.now());
      }
    };
    // A full minute must not use up the day.
    if ((await hit("virustotal-minute", MINUTE_MS)) > VT_PER_MINUTE) return false;
    return (await hit("virustotal-day", DAY_MS)) <= VT_PER_DAY;
  }

  async lookup(sha256s: readonly string[], signal?: AbortSignal): Promise<Map<string, Reputation>> {
    const out = new Map<string, Reputation>();
    let live = 0;
    let stop: "quota" | "error" | null = null;
    for (const sha of sha256s) {
      const cached = await this.cache.get(sha, this.now()).catch((e) => {
        logError("virustotal cache read failed", e);
        return null;
      });
      if (cached) {
        out.set(sha, cached);
        continue;
      }
      if (stop) {
        out.set(sha, { status: "skipped", reason: stop });
        continue;
      }
      if (live >= VT_LIVE_PER_SCAN || !(await this.reserve())) {
        out.set(sha, { status: "skipped", reason: "quota" });
        continue;
      }
      live += 1;
      try {
        const reputation = await this.client.file(sha, signal);
        out.set(sha, reputation);
        await this.cache.set(sha, reputation, this.now()).catch((e) => logError("virustotal cache write failed", e));
      } catch (e) {
        const quota = e instanceof VirusTotalError && e.kind === "quota";
        if (!quota) logError("virustotal lookup failed", e);
        // A rejected key or a full quota will fail the same way for the rest of this scan.
        if (quota || (e instanceof VirusTotalError && e.kind === "auth")) stop = quota ? "quota" : "error";
        out.set(sha, { status: "skipped", reason: quota ? "quota" : "error" });
      }
    }
    return out;
  }
}

/** The site's service, or undefined when no key is configured. */
export function createReputationService(apiKey: string | undefined, db: Db | null): ReputationService | undefined {
  if (!apiKey) return undefined;
  const client = new VirusTotalClient(apiKey);
  if (!db) return new VirusTotalReputation(client, new MemoryRateStore(), new MemoryReputationCache());
  const rates = getRateStore();
  return new VirusTotalReputation(client, rates.configured ? rates : new MemoryRateStore(), new PostgresReputationCache(db));
}

let shared: ReputationService | undefined | null = null;

export function getReputationService(): ReputationService | undefined {
  if (shared === null) {
    const url = databaseUrl();
    shared = createReputationService(process.env.VIRUSTOTAL_API_KEY || undefined, url ? neonDb(url) : null);
  }
  return shared;
}
