/** The private false-report store, run against PGlite (real Postgres in WebAssembly). */

import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "../src/lib/db";
import { type FalseReportInput, PostgresReportStore } from "../src/lib/report-store";

function pgliteDb(pg: PGlite): Db {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return (await pg.query(text, params)).rows as T[];
    },
  };
}

const input = (over: Partial<FalseReportInput> = {}): FalseReportInput => ({
  fullName: "octo/demo",
  headSha: "a".repeat(40),
  verdict: "dangerous",
  score: 75,
  engineVersion: "0.10.0",
  reason: "this tool only reads cookies for a feature",
  clientKey: "1.2.3.4",
  ...over,
});

describe("PostgresReportStore", () => {
  let pg: PGlite;
  let store: PostgresReportStore;

  beforeAll(async () => {
    pg = new PGlite();
    await pg.waitReady;
  }, 60_000);

  beforeEach(async () => {
    await pg.exec("DROP TABLE IF EXISTS false_reports");
    store = new PostgresReportStore(pgliteDb(pg), "server-secret", () => 1);
  });

  it("saves reports and lists them newest first", async () => {
    await store.save(input({ reason: "first" }), new Date("2026-10-17T10:00:00Z"));
    await store.save(input({ reason: "second" }), new Date("2026-10-17T11:00:00Z"));
    const rows = await store.list(10, 0);
    expect(rows.map((r) => r.reason)).toEqual(["second", "first"]);
    expect(rows[0]).toMatchObject({ fullName: "octo/demo", verdict: "dangerous", score: 75, engineVersion: "0.10.0" });
    expect(await store.count()).toBe(2);
  });

  it("stores the client only as a 32-hex hash, never the raw IP", async () => {
    await store.save(input({ clientKey: "9.9.9.9" }), new Date());
    const rows = (await pg.query<{ client_hash: string }>("SELECT client_hash FROM false_reports")).rows;
    expect(rows[0].client_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(rows[0].client_hash).not.toContain("9.9.9.9");
  });

  it("paginates and prunes beyond the cap", async () => {
    const base = Date.parse("2026-10-17T10:00:00Z");
    for (let i = 0; i < 5; i++) await store.save(input({ reason: `r${i}` }), new Date(base + i * 1000));
    expect((await store.list(2, 0)).map((r) => r.reason)).toEqual(["r4", "r3"]);
    expect((await store.list(2, 4)).map((r) => r.reason)).toEqual(["r0"]);
    await store.prune(3);
    expect(await store.count()).toBe(3);
    expect((await store.list(10, 0)).map((r) => r.reason)).toEqual(["r4", "r3", "r2"]);
  });
});
