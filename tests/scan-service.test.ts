import { beforeEach, describe, expect, it } from "vitest";

import type { Report } from "../src/engine";
import { GitHubClient } from "../src/engine/github";
import { type Deps, RATE_MAX, STORE_TTL_MS, resetScanService, runScan } from "../src/lib/scan-service";
import { type ScanStore, nullScanStore } from "../src/lib/scan-store";
import { FakeGitHub } from "./helpers";

function deps(gh: FakeGitHub, now = () => 1_000_000, store: ScanStore = nullScanStore): Deps {
  return { client: () => new GitHubClient({ fetch: gh.fetch }), now, store: () => store };
}

/** A store that keeps reports in a map and can be told to fail. */
class MapStore implements ScanStore {
  readonly configured = true;
  saved = new Map<string, Report>();
  broken = false;

  async save(report: Report) {
    if (this.broken) throw new Error("db down");
    this.saved.set(report.target!.fullName.toLowerCase(), report);
  }
  async fresh(key: string, since: Date) {
    if (this.broken) throw new Error("db down");
    const r = this.saved.get(key);
    return r && Date.parse(r.startedAt) > since.getTime() ? r : null;
  }
  async list() {
    return [];
  }
  async counts() {
    return { clean: 0, suspicious: 0, dangerous: 0, incomplete: 0 };
  }
}

describe("runScan", () => {
  beforeEach(() => resetScanService());

  it("returns a report and serves repeats from the memory cache", async () => {
    const gh = new FakeGitHub();
    const first = await runScan("github.com/octo/demo", "1.1.1.1", deps(gh));
    expect(first).toMatchObject({ status: 200, cached: false, body: { verdict: "clean" } });
    const calls = gh.requests.length;
    const second = await runScan("OCTO/DEMO", "1.1.1.1", deps(gh));
    expect(second.cached).toBe(true);
    expect(gh.requests.length).toBe(calls);
  });

  it("expires the memory cache", async () => {
    const gh = new FakeGitHub();
    let t = 1_000_000;
    await runScan("octo/demo", "ip", deps(gh, () => t));
    t += 11 * 60 * 1000;
    expect((await runScan("octo/demo", "ip", deps(gh, () => t))).cached).toBe(false);
  });

  it("saves scans and serves recent stored scans without calling GitHub", async () => {
    const gh = new FakeGitHub();
    const store = new MapStore();
    const now = () => Date.now();
    await runScan("octo/demo", "ip", deps(gh, now, store));
    expect(store.saved.has("octo/demo")).toBe(true);

    resetScanService(); // another serverless instance: empty memory cache
    const calls = gh.requests.length;
    const again = await runScan("octo/demo", "ip", deps(gh, now, store));
    expect(again.cached).toBe(true);
    expect(gh.requests.length).toBe(calls);

    resetScanService();
    const later = () => Date.now() + STORE_TTL_MS + 1000;
    expect((await runScan("octo/demo", "ip", deps(gh, later, store))).cached).toBe(false);
  });

  it("scans again when fresh is asked", async () => {
    const gh = new FakeGitHub();
    await runScan("octo/demo", "ip", deps(gh));
    const fresh = await runScan("octo/demo", "ip", deps(gh), { fresh: true });
    expect(fresh.cached).toBe(false);
  });

  it("keeps scanning when the database fails", async () => {
    const gh = new FakeGitHub();
    const store = new MapStore();
    store.broken = true;
    const r = await runScan("octo/demo", "ip", deps(gh, () => Date.now(), store));
    expect(r).toMatchObject({ status: 200, cached: false });
  });

  it("rejects invalid input without calling GitHub", async () => {
    const gh = new FakeGitHub();
    const r = await runScan("not a repo", "ip", deps(gh));
    expect(r).toMatchObject({ status: 400, body: { error: { code: "invalid_target" } } });
    expect(gh.requests).toEqual([]);
  });

  it("limits scans per client", async () => {
    const gh = new FakeGitHub();
    for (let i = 0; i < RATE_MAX; i++) {
      expect((await runScan(`octo/demo${i}`, "9.9.9.9", deps(gh))).status).not.toBe(429);
    }
    expect((await runScan("octo/other", "9.9.9.9", deps(gh))).status).toBe(429);
    expect((await runScan("octo/other", "8.8.8.8", deps(gh))).status).not.toBe(429);
  });

  it("maps GitHub and archive errors to HTTP statuses", async () => {
    const missing = new FakeGitHub();
    expect((await runScan("octo/nope", "a", deps(missing))).status).toBe(404);

    const broken = new FakeGitHub();
    broken.tarball = new TextEncoder().encode("not a tarball");
    expect(await runScan("octo/demo", "b", deps(broken))).toMatchObject({
      status: 422,
      body: { error: { code: "archive_error" } },
    });
  });
});
