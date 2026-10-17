/**
 * Visitor-submitted "this result is wrong" reports. Private: only the owner
 * reads them (src/app/dorukadm). Stores the free-text reason plus the scan's
 * context (repo, verdict, score, engine version) and an HMAC of the client key
 * for abuse correlation — never the raw IP. Without DATABASE_URL nothing is
 * stored and the report endpoint reports storage as unavailable.
 */

import { createHmac } from "node:crypto";

import { type Db, databaseUrl, neonDb } from "./db";

/** Rows kept at most; oldest deleted beyond this. */
export const MAX_REPORTS = 2_000;
const PRUNE_EVERY = 25;
const ALREADY_EXISTS = new Set(["23505", "42P07", "42710"]);

export interface FalseReportInput {
  fullName: string;
  headSha: string;
  verdict: string;
  score: number;
  engineVersion: string;
  reason: string;
  /** The rate-limit client key (IP, IPv6 /64); stored only as an HMAC. */
  clientKey: string;
}

export interface FalseReport {
  id: number;
  fullName: string;
  headSha: string;
  verdict: string;
  score: number;
  engineVersion: string;
  reason: string;
  createdAt: string;
}

export interface ReportStore {
  readonly configured: boolean;
  save(input: FalseReportInput, now: Date): Promise<void>;
  list(limit: number, offset: number): Promise<FalseReport[]>;
  count(): Promise<number>;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS false_reports (
    id             bigserial PRIMARY KEY,
    repo_key       text NOT NULL,
    full_name      text NOT NULL,
    head_sha       text NOT NULL,
    verdict        text NOT NULL,
    score          integer NOT NULL,
    engine_version text NOT NULL,
    reason         text NOT NULL,
    client_hash    text NOT NULL,
    created_at     timestamptz NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS false_reports_created_at ON false_reports (created_at DESC)",
];

interface Row {
  id: number | string;
  full_name: string;
  head_sha: string;
  verdict: string;
  score: number;
  engine_version: string;
  reason: string;
  created_at: string | Date;
}

export class PostgresReportStore implements ReportStore {
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

  /** Pseudonymous client id: correlates abuse without revealing the IP. */
  private clientHash(key: string): string {
    return createHmac("sha256", this.secret).update(key).digest("hex").slice(0, 32);
  }

  async save(input: FalseReportInput, now: Date): Promise<void> {
    await this.ensureSchema();
    await this.db.query(
      `INSERT INTO false_reports (repo_key, full_name, head_sha, verdict, score, engine_version, reason, client_hash, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz)`,
      [
        input.fullName.toLowerCase(),
        input.fullName,
        input.headSha,
        input.verdict,
        input.score,
        input.engineVersion,
        input.reason,
        this.clientHash(input.clientKey),
        now.toISOString(),
      ],
    );
    if (this.random() < 1 / PRUNE_EVERY) await this.prune();
  }

  async prune(maxRows = MAX_REPORTS): Promise<void> {
    await this.ensureSchema();
    await this.db.query(
      `DELETE FROM false_reports WHERE id IN (
         SELECT id FROM false_reports ORDER BY created_at DESC OFFSET $1
       )`,
      [maxRows],
    );
  }

  async list(limit: number, offset: number): Promise<FalseReport[]> {
    await this.ensureSchema();
    const rows = await this.db.query<Row>(
      `SELECT id, full_name, head_sha, verdict, score, engine_version, reason, created_at
       FROM false_reports ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      fullName: r.full_name,
      headSha: r.head_sha,
      verdict: r.verdict,
      score: Number(r.score),
      engineVersion: r.engine_version,
      reason: r.reason,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async count(): Promise<number> {
    await this.ensureSchema();
    const rows = await this.db.query<{ n: number }>("SELECT count(*)::int AS n FROM false_reports");
    return Number(rows[0]?.n ?? 0);
  }
}

export const nullReportStore: ReportStore = {
  configured: false,
  async save() {},
  async list() {
    return [];
  },
  async count() {
    return 0;
  },
};

let shared: ReportStore | null = null;

export function getReportStore(): ReportStore {
  if (!shared) {
    const url = databaseUrl();
    shared = url ? new PostgresReportStore(neonDb(url), url) : nullReportStore;
  }
  return shared;
}
