/** The PostgreSQL store, run against PGlite (real Postgres compiled to WebAssembly, in memory). */

import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Report, Verdict } from "../src/engine";
import { emptyStats } from "../src/engine/types";
import type { Db } from "../src/lib/db";
import { PostgresScanStore } from "../src/lib/scan-store";
import { sanitize } from "../src/engine/text";

function pgliteDb(pg: PGlite): Db {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return (await pg.query(text, params)).rows as T[];
    },
  };
}

function report(fullName: string, verdict: Verdict, startedAt: string, score = verdict === "dangerous" ? 90 : 0): Report {
  return {
    schemaVersion: 1,
    engineVersion: "test",
    target: {
      fullName,
      url: `https://github.com/${fullName}`,
      description: "demo",
      defaultBranch: "main",
      headSha: "0123456789abcdef0123456789abcdef01234567",
      sizeKb: 1,
      stars: 7,
      forks: 0,
      isFork: false,
      archived: false,
      createdAt: "2020-01-01T00:00:00Z",
      pushedAt: null,
      owner: { login: fullName.split("/")[0], type: "User", createdAt: null },
    },
    verdict,
    score,
    complete: true,
    partial: null,
    stats: { ...emptyStats(), entriesSeen: 1, textFiles: 1 },
    archiveCheck: { status: "ok", hidden: 0, scanned: 0 },
    dependencyCheck: { status: "none", packages: 0, malicious: 0 },
    testFilesCapped: false,
    submodules: [],
    rules: score ? [{ id: "GR-CODE-001", title: "Decodes hidden code and executes it", category: "code", points: 45, findings: 2 }] : [],
    findings: [],
    omittedFindings: 0,
    releaseAssets: [],
    rulesRun: 27,
    startedAt,
    durationMs: 10,
  };
}

describe("PostgresScanStore", () => {
  let pg: PGlite;
  let store: PostgresScanStore;

  // Loading the WebAssembly build takes a few seconds; share one database.
  beforeAll(async () => {
    pg = new PGlite();
    await pg.waitReady;
  }, 60_000);

  beforeEach(async () => {
    await pg.exec("DROP TABLE IF EXISTS scans");
    store = new PostgresScanStore(pgliteDb(pg));
  });

  it("lists clean repositories in the Safe Zone and dangerous ones in the Scammer list, newest first", async () => {
    await store.save(report("a/clean-old", "clean", "2026-10-01T00:00:00Z"));
    await store.save(report("b/clean-new", "clean", "2026-10-02T00:00:00Z"));
    await store.save(report("c/bad", "dangerous", "2026-10-03T00:00:00Z"));
    await store.save(report("d/meh", "suspicious", "2026-10-03T00:00:00Z", 40));

    expect((await store.list("clean", 10)).map((s) => s.fullName)).toEqual(["b/clean-new", "a/clean-old"]);
    const bad = await store.list("dangerous", 10);
    expect(bad).toHaveLength(1);
    expect(bad[0]).toMatchObject({
      fullName: "c/bad",
      score: 90,
      stars: 7,
      topRules: [{ id: "GR-CODE-001", title: "Decodes hidden code and executes it", points: 45 }],
      scannedAt: "2026-10-03T00:00:00.000Z",
    });
    expect(await store.counts()).toEqual({ clean: 2, suspicious: 1, dangerous: 1, incomplete: 0 });
  });

  it("keeps only the latest scan of a repository", async () => {
    await store.save(report("Octo/Demo", "dangerous", "2026-10-01T00:00:00Z"));
    await store.save(report("octo/demo", "clean", "2026-10-02T00:00:00Z"));
    expect(await store.list("dangerous", 10)).toEqual([]);
    expect((await store.list("clean", 10)).map((s) => s.fullName)).toEqual(["octo/demo"]);
  });

  it("never lets an older scan overwrite a newer one", async () => {
    await store.save(report("octo/demo", "clean", "2026-10-05T00:00:00Z"));
    await store.save(report("octo/demo", "dangerous", "2026-10-04T00:00:00Z"));
    expect((await store.list("clean", 10)).map((s) => s.fullName)).toEqual(["octo/demo"]);
    expect(await store.list("dangerous", 10)).toEqual([]);
  });

  it("stores text that was cut in the middle of an emoji", async () => {
    const r = report("octo/demo", "clean", "2026-10-02T00:00:00Z");
    const emoji = String.fromCodePoint(0x1f600);
    r.target!.description = sanitize(`${"x".repeat(298)}${emoji}${emoji}`, 300);
    await store.save(r);
    expect((await store.list("clean", 1))[0].description).toBe(r.target!.description);
  });

  it("prunes the oldest rows beyond the limit", async () => {
    for (let i = 0; i < 5; i++) await store.save(report(`o/r${i}`, "clean", `2026-10-0${i + 1}T00:00:00Z`));
    await store.prune(2);
    expect((await store.list("clean", 10)).map((s) => s.fullName)).toEqual(["o/r4", "o/r3"]);
  });

  it("treats losing the table-creation race as success", async () => {
    const raced = new PostgresScanStore({
      async query<T>(text: string, params?: unknown[]) {
        if (text.startsWith("CREATE")) throw Object.assign(new Error("duplicate key"), { code: "23505" });
        return (await pg.query(text, params)).rows as T[];
      },
    });
    await store.save(report("octo/demo", "clean", "2026-10-02T00:00:00Z")); // creates the table
    expect((await raced.list("clean", 10)).map((s) => s.fullName)).toEqual(["octo/demo"]);
  });

  it("returns a stored report only when it is recent enough", async () => {
    const r = report("octo/demo", "clean", "2026-10-02T00:00:00Z");
    await store.save(r);
    expect(await store.fresh("octo/demo", new Date("2026-10-01T00:00:00Z"))).toEqual(r);
    expect(await store.fresh("octo/demo", new Date("2026-10-03T00:00:00Z"))).toBeNull();
    expect(await store.fresh("other/repo", new Date(0))).toBeNull();
  });

  it("limits list length", async () => {
    for (let i = 0; i < 5; i++) await store.save(report(`o/r${i}`, "clean", `2026-10-0${i + 1}T00:00:00Z`));
    expect(await store.list("clean", 3)).toHaveLength(3);
  });
});
