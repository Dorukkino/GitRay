/** The shared rate-limit counters, run against PGlite (real Postgres in WebAssembly). */

import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "../src/lib/db";
import { PostgresRateStore } from "../src/lib/rate-store";

function pgliteDb(pg: PGlite): Db {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return (await pg.query(text, params)).rows as T[];
    },
  };
}

const MINUTE = 60_000;
const T0 = Date.parse("2026-10-09T10:00:00Z");

describe("PostgresRateStore", () => {
  let pg: PGlite;
  let store: PostgresRateStore;

  // Loading the WebAssembly build takes a few seconds; share one database.
  beforeAll(async () => {
    pg = new PGlite();
    await pg.waitReady;
  }, 60_000);

  beforeEach(async () => {
    await pg.exec("DROP TABLE IF EXISTS rate_limits");
    store = new PostgresRateStore(pgliteDb(pg), "server-secret", () => 1);
  });

  it("counts hits per bucket, client and window", async () => {
    expect(await store.hit("scan", "1.2.3.4", MINUTE, T0)).toBe(1);
    expect(await store.hit("scan", "1.2.3.4", MINUTE, T0 + 10_000)).toBe(2);
    expect(await store.hit("scan", "5.6.7.8", MINUTE, T0)).toBe(1);
    expect(await store.hit("other", "1.2.3.4", MINUTE, T0)).toBe(1);
    // The next window starts from zero.
    expect(await store.hit("scan", "1.2.3.4", MINUTE, T0 + MINUTE)).toBe(1);
  });

  it("never stores the client's IP address", async () => {
    await store.hit("scan", "203.0.113.9", MINUTE, T0);
    const rows = (await pg.query<{ client: string }>("SELECT client FROM rate_limits")).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].client).not.toContain("203.0.113.9");
    expect(rows[0].client).toMatch(/^[0-9a-f]{32}$/);
  });

  it("deletes windows older than a day", async () => {
    await store.hit("scan", "a", MINUTE, T0);
    await store.prune(T0 + 2 * 24 * 60 * MINUTE);
    expect((await pg.query("SELECT * FROM rate_limits")).rows).toHaveLength(0);
  });

  it("counts correctly when many requests arrive at once", async () => {
    const counts = await Promise.all(Array.from({ length: 10 }, () => store.hit("scan", "a", MINUTE, T0)));
    expect(counts.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
