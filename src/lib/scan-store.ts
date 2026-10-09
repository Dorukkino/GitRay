/**
 * Stores the latest scan of each repository. Feeds the Safe Zone (clean),
 * Scammer (dangerous) and recent scans lists and the weekly count on the home
 * page, and serves repeat scans without calling GitHub.
 *
 * Only the sanitized report (engine/report.ts) is stored, never repository
 * files. Without DATABASE_URL the site works as before and the lists are empty.
 */

import type { Report, Verdict } from "@/engine";

import { type Db, databaseUrl, neonDb } from "./db";

export interface ScanSummary {
  fullName: string;
  headSha: string;
  verdict: Verdict;
  score: number;
  description: string | null;
  stars: number;
  findings: number;
  topRules: { id: string; title: string; points: number }[];
  scannedAt: string;
}

/** "all" is the recent scans list: every verdict, newest first. */
export type ListedVerdict = "clean" | "dangerous" | "all";

export interface ScanStore {
  readonly configured: boolean;
  save(report: Report): Promise<void>;
  /** The stored report of a repository if it was scanned after `since`. */
  fresh(repoKey: string, since: Date): Promise<Report | null>;
  list(verdict: ListedVerdict, limit: number): Promise<ScanSummary[]>;
  counts(): Promise<Record<Verdict, number>>;
  /** Repositories whose latest scan is newer than `since` (a rescan counts once). */
  countSince(since: Date): Promise<number>;
}

/** Rows kept at most; the oldest scans are deleted beyond this (free plan: 0.5 GB). */
export const MAX_ROWS = 5_000;
/** One save in this many also prunes old rows. */
const PRUNE_EVERY = 50;
/** Postgres codes raised when two instances create the same table at the same time. */
const ALREADY_EXISTS = new Set(["23505", "42P07", "42710"]);

export function repoKey(fullName: string): string {
  return fullName.toLowerCase();
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS scans (
    repo_key    text PRIMARY KEY,
    full_name   text NOT NULL,
    head_sha    text NOT NULL,
    verdict     text NOT NULL CHECK (verdict IN ('clean', 'suspicious', 'dangerous', 'incomplete')),
    score       integer NOT NULL,
    complete    boolean NOT NULL,
    description text,
    stars       integer NOT NULL DEFAULT 0,
    findings    integer NOT NULL DEFAULT 0,
    top_rules   jsonb NOT NULL DEFAULT '[]'::jsonb,
    report      jsonb NOT NULL,
    scanned_at  timestamptz NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS scans_verdict_scanned_at ON scans (verdict, scanned_at DESC)",
  "CREATE INDEX IF NOT EXISTS scans_scanned_at ON scans (scanned_at DESC)",
];

const EMPTY_COUNTS: Record<Verdict, number> = { clean: 0, suspicious: 0, dangerous: 0, incomplete: 0 };

interface SummaryRow {
  full_name: string;
  head_sha: string;
  verdict: Verdict;
  score: number;
  description: string | null;
  stars: number;
  findings: number;
  top_rules: unknown;
  scanned_at: string | Date;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return (value as T) ?? fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export class PostgresScanStore implements ScanStore {
  readonly configured = true;
  private schema: Promise<void> | null = null;

  constructor(
    private readonly db: Db,
    private readonly random: () => number = Math.random,
  ) {}

  /**
   * Creates the table on first use, so a fresh database needs no setup step.
   * Serverless instances may race on it; losing that race is not an error.
   */
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

  async save(report: Report): Promise<void> {
    const t = report.target;
    if (!t) return;
    await this.ensureSchema();
    const topRules = report.rules.slice(0, 3).map((r) => ({ id: r.id, title: r.title, points: r.points }));
    await this.db.query(
      `INSERT INTO scans (repo_key, full_name, head_sha, verdict, score, complete, description, stars, findings, top_rules, report, scanned_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::timestamptz)
       ON CONFLICT (repo_key) DO UPDATE SET
         full_name = EXCLUDED.full_name, head_sha = EXCLUDED.head_sha, verdict = EXCLUDED.verdict,
         score = EXCLUDED.score, complete = EXCLUDED.complete, description = EXCLUDED.description,
         stars = EXCLUDED.stars, findings = EXCLUDED.findings, top_rules = EXCLUDED.top_rules,
         report = EXCLUDED.report, scanned_at = EXCLUDED.scanned_at
       WHERE scans.scanned_at <= EXCLUDED.scanned_at`,
      [
        repoKey(t.fullName),
        t.fullName,
        t.headSha,
        report.verdict,
        report.score,
        report.complete,
        t.description,
        t.stars,
        report.findings.length + report.omittedFindings,
        JSON.stringify(topRules),
        JSON.stringify(report),
        report.startedAt,
      ],
    );
    if (this.random() < 1 / PRUNE_EVERY) await this.prune();
  }

  /** Delete the oldest scans beyond MAX_ROWS. */
  async prune(maxRows = MAX_ROWS): Promise<void> {
    await this.ensureSchema();
    await this.db.query(
      `DELETE FROM scans WHERE repo_key IN (
         SELECT repo_key FROM scans ORDER BY scanned_at DESC OFFSET $1
       )`,
      [maxRows],
    );
  }

  async fresh(key: string, since: Date): Promise<Report | null> {
    await this.ensureSchema();
    const rows = await this.db.query<{ report: unknown }>(
      "SELECT report FROM scans WHERE repo_key = $1 AND scanned_at > $2::timestamptz",
      [key, since.toISOString()],
    );
    const report = rows[0] ? parseJson<Report | null>(rows[0].report, null) : null;
    return report?.schemaVersion === 1 ? report : null;
  }

  async list(verdict: ListedVerdict, limit: number): Promise<ScanSummary[]> {
    await this.ensureSchema();
    const columns = "full_name, head_sha, verdict, score, description, stars, findings, top_rules, scanned_at";
    const rows =
      verdict === "all"
        ? await this.db.query<SummaryRow>(`SELECT ${columns} FROM scans ORDER BY scanned_at DESC LIMIT $1`, [limit])
        : await this.db.query<SummaryRow>(
            `SELECT ${columns} FROM scans WHERE verdict = $1 ORDER BY scanned_at DESC LIMIT $2`,
            [verdict, limit],
          );
    return rows.map((r) => ({
      fullName: r.full_name,
      headSha: r.head_sha,
      verdict: r.verdict,
      score: Number(r.score),
      description: r.description,
      stars: Number(r.stars),
      findings: Number(r.findings),
      topRules: parseJson<ScanSummary["topRules"]>(r.top_rules, []),
      scannedAt: new Date(r.scanned_at).toISOString(),
    }));
  }

  async counts(): Promise<Record<Verdict, number>> {
    await this.ensureSchema();
    const rows = await this.db.query<{ verdict: Verdict; n: number }>(
      "SELECT verdict, count(*)::int AS n FROM scans GROUP BY verdict",
    );
    const out = { ...EMPTY_COUNTS };
    for (const r of rows) if (r.verdict in out) out[r.verdict] = Number(r.n);
    return out;
  }

  async countSince(since: Date): Promise<number> {
    await this.ensureSchema();
    const rows = await this.db.query<{ n: number }>("SELECT count(*)::int AS n FROM scans WHERE scanned_at > $1::timestamptz", [
      since.toISOString(),
    ]);
    return Number(rows[0]?.n ?? 0);
  }
}

/** Used when no database is configured: nothing is stored, lists are empty. */
export const nullScanStore: ScanStore = {
  configured: false,
  async save() {},
  async fresh() {
    return null;
  },
  async list() {
    return [];
  },
  async counts() {
    return { ...EMPTY_COUNTS };
  },
  async countSince() {
    return 0;
  },
};

let shared: ScanStore | null = null;

export function getScanStore(): ScanStore {
  if (!shared) {
    const url = databaseUrl();
    shared = url ? new PostgresScanStore(neonDb(url)) : nullScanStore;
  }
  return shared;
}
