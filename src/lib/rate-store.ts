/**
 * Rate-limit counters shared by every serverless instance, kept in the same
 * Postgres database as the scans (no extra service). Fixed windows: one row per
 * bucket, client and window, incremented with a single upsert.
 *
 * Client keys are IP addresses (IPv6 grouped by /64). They are never stored as
 * such: rows hold an HMAC of the key, made with a secret only the server knows
 * (the database URL), and rows older than a day are deleted.
 */

import { createHmac } from "node:crypto";

import { type Db, databaseUrl, neonDb } from "./db";

export interface RateStore {
  readonly configured: boolean;
  /** Count one event for `key` in the current window of `bucket`; returns the count including it. */
  hit(bucket: string, key: string, windowMs: number, now: number): Promise<number>;
}

/** Postgres codes raised when two instances create the same table at the same time. */
const ALREADY_EXISTS = new Set(["23505", "42P07", "42710"]);
/** One hit in this many also deletes old windows. */
const PRUNE_EVERY = 200;
const KEEP_MS = 24 * 60 * 60 * 1000;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS rate_limits (
    bucket       text NOT NULL,
    client       text NOT NULL,
    window_start timestamptz NOT NULL,
    hits         integer NOT NULL,
    PRIMARY KEY (bucket, client, window_start)
  )`,
];

export class PostgresRateStore implements RateStore {
  readonly configured = true;
  private schema: Promise<void> | null = null;

  constructor(
    private readonly db: Db,
    private readonly secret: string,
    private readonly random: () => number = Math.random,
  ) {}

  private ensureSchema(): Promise<void> {
    this.schema ??= (async () => {
      for (const statement of SCHEMA) {
        try {
          await this.db.query(statement);
        } catch (e) {
          const code = typeof e === "object" && e !== null && "code" in e ? String(e.code) : "";
          if (!ALREADY_EXISTS.has(code)) throw e;
        }
      }
    })().catch((e) => {
      this.schema = null;
      throw e;
    });
    return this.schema;
  }

  /** Pseudonymous client id: the same client maps to the same row, but the row does not reveal the IP. */
  private clientId(key: string): string {
    return createHmac("sha256", this.secret).update(key).digest("hex").slice(0, 32);
  }

  async hit(bucket: string, key: string, windowMs: number, now: number): Promise<number> {
    await this.ensureSchema();
    const windowStart = new Date(Math.floor(now / windowMs) * windowMs).toISOString();
    const rows = await this.db.query<{ hits: number }>(
      `INSERT INTO rate_limits (bucket, client, window_start, hits) VALUES ($1, $2, $3::timestamptz, 1)
       ON CONFLICT (bucket, client, window_start) DO UPDATE SET hits = rate_limits.hits + 1
       RETURNING hits`,
      [bucket, this.clientId(key), windowStart],
    );
    if (this.random() < 1 / PRUNE_EVERY) await this.prune(now);
    return Number(rows[0]?.hits ?? 0);
  }

  async prune(now: number): Promise<void> {
    await this.ensureSchema();
    await this.db.query("DELETE FROM rate_limits WHERE window_start < $1::timestamptz", [new Date(now - KEEP_MS).toISOString()]);
  }
}

/** Counters in this instance's memory: for the CLI, and as a fallback when the database fails. */
export class MemoryRateStore implements RateStore {
  readonly configured = true;
  private readonly counts = new Map<string, { hits: number; until: number }>();

  async hit(bucket: string, key: string, windowMs: number, now: number): Promise<number> {
    const start = Math.floor(now / windowMs) * windowMs;
    const id = `${bucket}|${key}|${start}`;
    const hits = (this.counts.get(id)?.hits ?? 0) + 1;
    this.counts.set(id, { hits, until: start + windowMs });
    if (this.counts.size > 10_000) {
      for (const [k, v] of this.counts) if (v.until <= now) this.counts.delete(k);
    }
    return hits;
  }
}

export const nullRateStore: RateStore = {
  configured: false,
  async hit() {
    return 0;
  },
};

let shared: RateStore | null = null;

export function getRateStore(): RateStore {
  if (!shared) {
    const url = databaseUrl();
    shared = url ? new PostgresRateStore(neonDb(url), url) : nullRateStore;
  }
  return shared;
}
