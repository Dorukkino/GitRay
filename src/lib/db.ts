/**
 * PostgreSQL access. Production uses Neon's serverless HTTP driver (free tier,
 * configured via DATABASE_URL); tests use PGlite through the same interface.
 */

import { neon } from "@neondatabase/serverless";

export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

/** A query that takes longer than this is abandoned; the site works without the database. */
export const QUERY_TIMEOUT_MS = 5_000;

/** The host provides the Neon connection as DATABASE_URL (POSTGRES_URL is also accepted). */
export function databaseUrl(): string | null {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || null;
}

export function neonDb(url: string): Db {
  const sql = neon(url);
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const rows = await sql.query(text, params, {
        fetchOptions: { signal: AbortSignal.timeout(QUERY_TIMEOUT_MS) },
      });
      return rows as T[];
    },
  };
}
