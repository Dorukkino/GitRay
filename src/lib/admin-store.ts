/**
 * The single owner account for the private admin panel (src/app/dorukadm).
 * One row only (id = 1). Created once, during the token-gated first-run setup;
 * the password is stored only as a scrypt hash with a per-account salt
 * (src/lib/admin-auth.ts). Without DATABASE_URL there is no admin account.
 */

import { type Db, databaseUrl, neonDb } from "./db";

const ALREADY_EXISTS = new Set(["23505", "42P07", "42710"]);

export interface AdminRecord {
  username: string;
  passwordHash: string;
  salt: string;
}

export interface AdminStore {
  readonly configured: boolean;
  exists(): Promise<boolean>;
  get(): Promise<AdminRecord | null>;
  /** Insert the account only when none exists yet; returns true when it created it. */
  create(username: string, passwordHash: string, salt: string, now: Date): Promise<boolean>;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS admin_credentials (
    id            integer PRIMARY KEY CHECK (id = 1),
    username      text NOT NULL,
    password_hash text NOT NULL,
    salt          text NOT NULL,
    created_at    timestamptz NOT NULL
  )`,
];

export class PostgresAdminStore implements AdminStore {
  readonly configured = true;
  private schema: Promise<void> | null = null;

  constructor(private readonly db: Db) {}

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

  async exists(): Promise<boolean> {
    await this.ensureSchema();
    const rows = await this.db.query<{ n: number }>("SELECT count(*)::int AS n FROM admin_credentials");
    return Number(rows[0]?.n ?? 0) > 0;
  }

  async get(): Promise<AdminRecord | null> {
    await this.ensureSchema();
    const rows = await this.db.query<{ username: string; password_hash: string; salt: string }>(
      "SELECT username, password_hash, salt FROM admin_credentials WHERE id = 1",
    );
    const r = rows[0];
    return r ? { username: r.username, passwordHash: r.password_hash, salt: r.salt } : null;
  }

  async create(username: string, passwordHash: string, salt: string, now: Date): Promise<boolean> {
    await this.ensureSchema();
    const rows = await this.db.query<{ id: number }>(
      `INSERT INTO admin_credentials (id, username, password_hash, salt, created_at)
       VALUES (1, $1, $2, $3, $4::timestamptz) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [username, passwordHash, salt, now.toISOString()],
    );
    return rows.length > 0;
  }
}

export const nullAdminStore: AdminStore = {
  configured: false,
  async exists() {
    return false;
  },
  async get() {
    return null;
  },
  async create() {
    return false;
  },
};

let shared: AdminStore | null = null;

export function getAdminStore(): AdminStore {
  if (!shared) {
    const url = databaseUrl();
    shared = url ? new PostgresAdminStore(neonDb(url)) : nullAdminStore;
  }
  return shared;
}
