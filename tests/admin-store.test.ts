/** The single-row admin account store, run against PGlite. */

import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PostgresAdminStore } from "../src/lib/admin-store";
import type { Db } from "../src/lib/db";

function pgliteDb(pg: PGlite): Db {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return (await pg.query(text, params)).rows as T[];
    },
  };
}

describe("PostgresAdminStore", () => {
  let pg: PGlite;
  let store: PostgresAdminStore;

  beforeAll(async () => {
    pg = new PGlite();
    await pg.waitReady;
  }, 60_000);

  beforeEach(async () => {
    await pg.exec("DROP TABLE IF EXISTS admin_credentials");
    store = new PostgresAdminStore(pgliteDb(pg));
  });

  it("has no account until one is created", async () => {
    expect(await store.exists()).toBe(false);
    expect(await store.get()).toBeNull();
  });

  it("creates the account once and never a second time", async () => {
    expect(await store.create("doruk", "hash1", "salt1", new Date())).toBe(true);
    expect(await store.exists()).toBe(true);
    expect(await store.get()).toEqual({ username: "doruk", passwordHash: "hash1", salt: "salt1" });
    // A second attempt (even with other values) does not overwrite the account.
    expect(await store.create("intruder", "hash2", "salt2", new Date())).toBe(false);
    expect(await store.get()).toMatchObject({ username: "doruk", passwordHash: "hash1" });
  });
});
