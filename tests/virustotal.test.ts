/**
 * VirusTotal: the client, the quota/cache service and the scan step. No network:
 * a fake VirusTotal answers. "Programs" here are only PE headers padded with
 * zeros, never runnable code.
 */

import { createHash } from "node:crypto";

import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { GitHubClient } from "../src/engine/github";
import { toReport } from "../src/engine/report";
import { scanRepo } from "../src/engine/scanner";
import { type Reputation, type ReputationService, VirusTotalClient, VirusTotalError } from "../src/engine/virustotal";
import type { Db } from "../src/lib/db";
import { MemoryRateStore } from "../src/lib/rate-store";
import {
  MemoryReputationCache,
  PostgresReputationCache,
  VT_CACHE_MS,
  VT_PER_MINUTE,
  VirusTotalReputation,
} from "../src/lib/virustotal";
import { FakeGitHub, TarBuilder } from "./helpers";

const KEY = "a".repeat(64);
const sha = (n: number) => n.toString(16).padStart(64, "0");

/** A fake VirusTotal: known files answer with stats, others 404. */
class FakeVirusTotal {
  known = new Map<string, number>();
  status: number | null = null;
  requests: { url: string; key: string | null }[] = [];

  fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    this.requests.push({ url, key: new Headers(init?.headers).get("x-apikey") });
    if (this.status) return new Response("{}", { status: this.status });
    const hash = url.split("/").pop()!;
    const malicious = this.known.get(hash);
    if (malicious === undefined) return Response.json({ error: { code: "NotFoundError" } }, { status: 404 });
    return Response.json({
      data: { attributes: { last_analysis_stats: { malicious, suspicious: 0, harmless: 0, undetected: 70 - malicious } } },
    });
  }) as typeof fetch;
}

/** PE header bytes padded with zeros to `size`. Not a program. */
function fakePe(size: number, fill = 0): Uint8Array {
  const b = new Uint8Array(size).fill(fill);
  b.set([0x4d, 0x5a]);
  b.set([0x40, 0x00, 0x00, 0x00], 0x3c); // offset of the PE header
  b.set([0x50, 0x45, 0x00, 0x00], 0x40);
  return b;
}

describe("VirusTotalClient", () => {
  it("asks for one file by fingerprint with the key in a header", async () => {
    const vt = new FakeVirusTotal();
    vt.known.set(sha(1), 12);
    const client = new VirusTotalClient(KEY, { fetch: vt.fetch });
    expect(await client.file(sha(1))).toEqual({
      status: "found",
      stats: { malicious: 12, suspicious: 0, harmless: 0, undetected: 58 },
    });
    expect(vt.requests[0]).toEqual({ url: `https://www.virustotal.com/api/v3/files/${sha(1)}`, key: KEY });
    expect(await client.file(sha(2))).toEqual({ status: "unknown" });
  });

  it("reports quota and key problems without the key, and refuses bad fingerprints", async () => {
    const vt = new FakeVirusTotal();
    const client = new VirusTotalClient(KEY, { fetch: vt.fetch });
    vt.status = 429;
    await expect(client.file(sha(1))).rejects.toMatchObject({ kind: "quota" });
    vt.status = 401;
    const err = await client.file(sha(1)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VirusTotalError);
    expect(err).toMatchObject({ kind: "auth" });
    expect(String((err as Error).message)).not.toContain(KEY);
    await expect(client.file("../../users")).rejects.toThrow("Invalid SHA-256");
    expect(vt.requests).toHaveLength(2);
  });
});

describe("VirusTotalReputation", () => {
  function service(vt: FakeVirusTotal, now = () => Date.parse("2026-10-09T10:00:00Z")) {
    const rates = new MemoryRateStore();
    const cache = new MemoryReputationCache();
    return { rates, cache, svc: new VirusTotalReputation(new VirusTotalClient(KEY, { fetch: vt.fetch }), rates, cache, now) };
  }

  it("keeps to the shared quota of 4 a minute and reuses answers", async () => {
    const vt = new FakeVirusTotal();
    const { svc } = service(vt);
    const hashes = [1, 2, 3, 4, 5].map(sha);
    const first = await svc.lookup(hashes);
    expect([...first.values()].map((r) => r.status)).toEqual(["unknown", "unknown", "unknown", "unknown", "skipped"]);
    expect(first.get(sha(5))).toEqual({ status: "skipped", reason: "quota" });
    expect(vt.requests).toHaveLength(VT_PER_MINUTE);
    // The cached answers cost nothing, even with the minute's quota used up.
    const again = await svc.lookup(hashes.slice(0, 4));
    expect([...again.values()].every((r) => r.status === "unknown")).toBe(true);
    expect(vt.requests).toHaveLength(VT_PER_MINUTE);
  });

  it("stops at the daily quota", async () => {
    const vt = new FakeVirusTotal();
    const { svc, rates } = service(vt);
    const now = Date.parse("2026-10-09T10:00:00Z");
    for (let i = 0; i < 500; i++) await rates.hit("virustotal-day", "site", 24 * 60 * 60 * 1000, now);
    expect((await svc.lookup([sha(1)])).get(sha(1))).toEqual({ status: "skipped", reason: "quota" });
    expect(vt.requests).toHaveLength(0);
  });

  it("stops asking after VirusTotal says the quota is full or the key is wrong", async () => {
    const vt = new FakeVirusTotal();
    vt.status = 429;
    const quota = await service(vt).svc.lookup([sha(1), sha(2)]);
    expect([...quota.values()]).toEqual([
      { status: "skipped", reason: "quota" },
      { status: "skipped", reason: "quota" },
    ]);
    expect(vt.requests).toHaveLength(1);

    const vt2 = new FakeVirusTotal();
    vt2.status = 401;
    const auth = await service(vt2).svc.lookup([sha(1), sha(2)]);
    expect([...auth.values()].every((r) => r.status === "skipped" && r.reason === "error")).toBe(true);
    expect(vt2.requests).toHaveLength(1);
  });
});

function pgliteDb(pg: PGlite): Db {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return (await pg.query(text, params)).rows as T[];
    },
  };
}

describe("PostgresReputationCache", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = new PGlite();
    await pg.waitReady;
  }, 60_000);

  beforeEach(async () => {
    await pg.exec("DROP TABLE IF EXISTS virustotal_cache");
  });

  it("keeps answers for a day", async () => {
    const cache = new PostgresReputationCache(pgliteDb(pg), () => 1);
    const found: Reputation = { status: "found", stats: { malicious: 3, suspicious: 0, harmless: 1, undetected: 66 } };
    const t = Date.parse("2026-10-09T10:00:00Z");
    await cache.set(sha(1), found, t);
    await cache.set(sha(2), { status: "unknown" }, t);
    expect(await cache.get(sha(1), t + 1000)).toEqual(found);
    expect(await cache.get(sha(2), t + 1000)).toEqual({ status: "unknown" });
    expect(await cache.get(sha(1), t + VT_CACHE_MS + 1)).toBeNull();
    expect(await cache.get(sha(3), t)).toBeNull();
  });
});

/** A ReputationService that answers from a table and records what it was asked. */
class FakeReputation implements ReputationService {
  asked: string[] = [];
  constructor(private readonly answers: Map<string, Reputation>) {}
  async lookup(hashes: readonly string[]) {
    this.asked.push(...hashes);
    return new Map(hashes.map((h) => [h, this.answers.get(h) ?? { status: "unknown" as const }]));
  }
}

const hex = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const found = (malicious: number): Reputation => ({
  status: "found",
  stats: { malicious, suspicious: 0, harmless: 0, undetected: 70 - malicious },
});

describe("the VirusTotal step of a scan", () => {
  it("looks up committed programs (read whole, even past 1 MB) and release files", async () => {
    const big = fakePe(2 * 1024 * 1024, 7);
    const small = fakePe(4096);
    const gh = new FakeGitHub();
    gh.tarball = new TarBuilder().file("bin/loader.exe", big).file("tests/data/helper.exe", small).file("README.md", "# demo\n").build();
    const releaseSha = sha(9);
    gh.releases = [
      {
        tag_name: "v1.0",
        assets: [
          { name: "checksums.sha256", size: 10, digest: `sha256:${sha(8)}` },
          { name: "tool-setup.exe", size: 10, digest: `sha256:${releaseSha}` },
          { name: "no-digest.zip", size: 10, digest: null },
        ],
      },
    ];
    const rep = new FakeReputation(new Map([[hex(big), found(40)]]));
    const result = await scanRepo({ owner: "octo", repo: "demo" }, new GitHubClient({ fetch: gh.fetch }), { reputation: rep });

    // Programs outside tests first, then release programs, then programs in tests; no checksum files.
    expect(rep.asked).toEqual([hex(big), releaseSha, hex(small)]);
    expect(result.reputationCheck.status).toBe("found");
    expect(result.ruleScores["GR-BIN-003"]).toBe(70);
    const finding = result.findings.find((f) => f.ruleId === "GR-BIN-003");
    expect(finding).toMatchObject({ path: "bin/loader.exe", note: "40 of 70 antivirus engines detect this file" });
    expect(result.verdict).toBe("dangerous");

    const report = toReport(result);
    expect(report.reputationCheck.files.map((f) => f.name)).toEqual(["bin/loader.exe", "v1.0/tool-setup.exe", "tests/data/helper.exe"]);
    // Found files link to their VirusTotal page; unknown files link to a search that never 404s.
    expect(report.reputationCheck.files[0].virusTotalUrl).toBe(`https://www.virustotal.com/gui/file/${hex(big)}`);
    expect(report.reputationCheck.files[1].virusTotalUrl).toBe(`https://www.virustotal.com/gui/search/${releaseSha}`);
  });

  it("skips checksum lists, looks up at most 10 files and only counts the rest", async () => {
    const gh = new FakeGitHub();
    const names = ["sha256.sum", "SHA256SUMS", "checksums.txt", "uv.tar.gz.sha256", "notes.md"];
    const programs = Array.from({ length: 13 }, (_, i) => `tool-${i}.zip`);
    gh.releases = [
      {
        tag_name: "v1",
        assets: [...names, ...programs].map((name, i) => ({ name, size: 1, digest: `sha256:${sha(100 + i)}` })),
      },
    ];
    const rep = new FakeReputation(new Map());
    const result = await scanRepo({ owner: "octo", repo: "demo" }, new GitHubClient({ fetch: gh.fetch }), { reputation: rep });
    expect(rep.asked).toHaveLength(10);
    expect(result.reputationCheck.files.map((f) => f.name)).toEqual(programs.slice(0, 10).map((n) => `v1/${n}`));
    expect(result.reputationCheck.notLookedUp).toBe(3);
  });

  it("weighs a few detections on a release file lightly", async () => {
    const gh = new FakeGitHub();
    gh.releases = [{ tag_name: "v2", assets: [{ name: "app.dmg", size: 1, digest: `sha256:${sha(5)}` }] }];
    const rep = new FakeReputation(new Map([[sha(5), found(2)]]));
    const result = await scanRepo({ owner: "octo", repo: "demo" }, new GitHubClient({ fetch: gh.fetch }), { reputation: rep });
    expect(result.ruleScores["GR-BIN-003"]).toBe(10);
    expect(result.findings.find((f) => f.ruleId === "GR-BIN-003")).toMatchObject({ path: "", line: 0 });
  });

  it("says not_configured without a key, none when there is nothing to look up, and checks release files of a partial scan", async () => {
    const gh = new FakeGitHub();
    const client = new GitHubClient({ fetch: gh.fetch });
    expect((await scanRepo({ owner: "octo", repo: "demo" }, client)).reputationCheck.status).toBe("none");
    gh.releases = [{ tag_name: "v1", assets: [{ name: "x.exe", size: 1, digest: `sha256:${sha(1)}` }] }];
    expect((await scanRepo({ owner: "octo", repo: "demo" }, client)).reputationCheck.status).toBe("not_configured");

    gh.repo = { ...gh.repo, size: 999_999_999 };
    const rep = new FakeReputation(new Map());
    const partial = await scanRepo({ owner: "octo", repo: "demo" }, client, { reputation: rep });
    expect(partial.partial?.limit).toBe("maxRepoSizeKb");
    expect(partial.reputationCheck).toMatchObject({ status: "ok", files: [{ name: "v1/x.exe", reputation: { status: "unknown" } }] });
  });

  it("never fails the scan when VirusTotal does", async () => {
    const gh = new FakeGitHub();
    gh.releases = [{ tag_name: "v1", assets: [{ name: "x.exe", size: 1, digest: `sha256:${sha(1)}` }] }];
    const broken: ReputationService = {
      lookup: async () => {
        throw new Error("down");
      },
    };
    const result = await scanRepo({ owner: "octo", repo: "demo" }, new GitHubClient({ fetch: gh.fetch }), { reputation: broken });
    expect(result.reputationCheck.status).toBe("unavailable");
    expect(result.verdict).toBe("clean");
  });
});
