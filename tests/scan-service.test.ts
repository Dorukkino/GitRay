import { beforeEach, describe, expect, it } from "vitest";

import type { Report } from "../src/engine";
import { GitHubClient } from "../src/engine/github";
import {
  type Deps,
  FRESH_COOLDOWN_MS,
  LOOKUP_MAX,
  RATE_MAX,
  SCAN_BUDGET_PER_HOUR,
  STORE_TTL_MS,
  clearScanCache,
  clientKey,
  resetScanService,
  runScan,
} from "../src/lib/scan-service";
import type { RateStore } from "../src/lib/rate-store";
import { type ScanStore, nullScanStore } from "../src/lib/scan-store";
import { FakeGitHub } from "./helpers";

// Reports carry the real scan time, so the service clock must be real too.
const clock = (offsetMs = 0) => () => Date.now() + offsetMs;

function deps(gh: FakeGitHub, now = clock(), store: ScanStore = nullScanStore): Deps {
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

/** Shared counters in a map, as the database would keep them across instances. */
class MapRates implements RateStore {
  readonly configured = true;
  counts = new Map<string, number>();
  broken = false;

  async hit(bucket: string, key: string, windowMs: number, now: number) {
    if (this.broken) throw new Error("db down");
    const k = `${bucket}|${key}|${Math.floor(now / windowMs)}`;
    const n = (this.counts.get(k) ?? 0) + 1;
    this.counts.set(k, n);
    return n;
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
    await runScan("octo/demo", "ip", deps(gh));
    expect((await runScan("octo/demo", "ip", deps(gh, clock(2 * 60 * 1000)))).cached).toBe(false);
  });

  it("saves scans and serves recent stored scans without calling GitHub", async () => {
    const gh = new FakeGitHub();
    const store = new MapStore();
    const now = clock();
    await runScan("octo/demo", "ip", deps(gh, now, store));
    expect(store.saved.has("octo/demo")).toBe(true);

    resetScanService(); // another serverless instance: empty memory cache
    const calls = gh.requests.length;
    const again = await runScan("octo/demo", "ip", deps(gh, now, store));
    expect(again.cached).toBe(true);
    expect(gh.requests.length).toBe(calls);

    resetScanService();
    const later = clock(STORE_TTL_MS + 1000);
    expect((await runScan("octo/demo", "ip", deps(gh, later, store))).cached).toBe(false);
  });

  it("scans again when the stored report comes from another engine version", async () => {
    const gh = new FakeGitHub();
    const store = new MapStore();
    await runScan("octo/demo", "ip", deps(gh, clock(), store));
    const stored = store.saved.get("octo/demo")!;
    store.saved.set("octo/demo", { ...stored, engineVersion: "0.0.1" });

    resetScanService();
    const calls = gh.requests.length;
    const again = await runScan("octo/demo", "ip", deps(gh, clock(), store));
    expect(again.cached).toBe(false);
    expect(gh.requests.length).toBeGreaterThan(calls);
  });

  it("scans again when fresh is asked, unless the last scan is under a minute old", async () => {
    const gh = new FakeGitHub();
    const store = new MapStore();
    await runScan("octo/demo", "ip", deps(gh, clock(), store));
    expect((await runScan("octo/demo", "ip", deps(gh, clock(), store), { fresh: true })).cached).toBe(true);

    const later = clock(FRESH_COOLDOWN_MS + 1000);
    expect((await runScan("octo/demo", "ip", deps(gh, later, store), { fresh: true })).cached).toBe(false);
  });

  it("does not keep results cut short by the time budget", async () => {
    const gh = new FakeGitHub();
    const store = new MapStore();
    const slow: Deps = { ...deps(gh, clock(), store), limits: { timeBudgetMs: 0 } };
    const r = await runScan("octo/demo", "ip", slow);
    expect(r).toMatchObject({ status: 200, body: { verdict: "incomplete", partial: { limit: "timeBudgetMs" } } });
    expect(store.saved.size).toBe(0);
    expect((await runScan("octo/demo", "ip", deps(gh, clock(), store))).cached).toBe(false);
  });

  it("limits uncached lookups per client", async () => {
    const gh = new FakeGitHub();
    const store = new MapStore();
    store.saved.set("octo/demo", (await runScan("octo/demo", "seed", deps(gh))).body as Report);
    resetScanService();
    for (let i = 0; i < LOOKUP_MAX; i++) {
      clearScanCache();
      expect((await runScan("octo/demo", "5.5.5.5", deps(gh, clock(), store))).status).toBe(200);
    }
    clearScanCache();
    expect((await runScan("octo/demo", "5.5.5.5", deps(gh, clock(), store))).status).toBe(429);
  });

  it("keeps scanning when the database fails", async () => {
    const gh = new FakeGitHub();
    const store = new MapStore();
    store.broken = true;
    const r = await runScan("octo/demo", "ip", deps(gh, clock(), store));
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

  it("limits scans per client across instances through the shared counters", async () => {
    const gh = new FakeGitHub();
    const rates = new MapRates();
    const withRates = (): Deps => ({ ...deps(gh), rates: () => rates });
    for (let i = 0; i < RATE_MAX; i++) {
      resetScanService(); // every request lands on a fresh serverless instance
      expect((await runScan("octo/demo", "9.9.9.9", withRates())).status).toBe(200);
    }
    resetScanService();
    expect((await runScan("octo/demo", "9.9.9.9", withRates())).body).toMatchObject({ error: { code: "rate_limited" } });
    // Someone else is not affected.
    resetScanService();
    expect((await runScan("octo/demo", "8.8.8.8", withRates())).status).toBe(200);
  });

  it("stops new scans when the hourly budget is used up, but still serves cached results", async () => {
    const gh = new FakeGitHub();
    const rates = new MapRates();
    const store = new MapStore();
    const d: Deps = { ...deps(gh, clock(), store), rates: () => rates };
    expect((await runScan("octo/demo", "1.1.1.1", d)).status).toBe(200);
    rates.counts.set(`scan-budget|site|${Math.floor(Date.now() / (60 * 60 * 1000))}`, SCAN_BUDGET_PER_HOUR);
    resetScanService();
    const blocked = await runScan("octo/other", "2.2.2.2", d);
    expect(blocked).toMatchObject({ status: 503, body: { error: { code: "budget_exhausted" } } });
    resetScanService();
    expect(await runScan("octo/demo", "2.2.2.2", d)).toMatchObject({ status: 200, cached: true });
  });

  it("does not let a client over its limit use up the budget", async () => {
    const gh = new FakeGitHub();
    const rates = new MapRates();
    for (let i = 0; i < RATE_MAX + 5; i++) {
      resetScanService();
      await runScan("octo/demo", "6.6.6.6", { ...deps(gh), rates: () => rates });
    }
    const budget = [...rates.counts].find(([k]) => k.startsWith("scan-budget|"))?.[1];
    expect(budget).toBe(RATE_MAX);
  });

  it("keeps scanning when the shared counters fail", async () => {
    const gh = new FakeGitHub();
    const rates = new MapRates();
    rates.broken = true;
    expect((await runScan("octo/demo", "ip", { ...deps(gh), rates: () => rates })).status).toBe(200);
  });

  it("hands the VirusTotal service to the scan", async () => {
    const gh = new FakeGitHub();
    gh.releases = [{ tag_name: "v1", assets: [{ name: "x.exe", size: 1, digest: `sha256:${"1".repeat(64)}` }] }];
    const asked: string[] = [];
    const reputation = {
      lookup: async (hashes: readonly string[]) => {
        asked.push(...hashes);
        return new Map(hashes.map((h) => [h, { status: "unknown" as const }]));
      },
    };
    const r = await runScan("octo/demo", "ip", { ...deps(gh), reputation: () => reputation });
    expect(asked).toEqual(["1".repeat(64)]);
    expect((r.body as Report).reputationCheck.status).toBe("ok");
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

describe("clientKey", () => {
  it("groups IPv6 clients by /64 and leaves IPv4 alone", () => {
    expect(clientKey("203.0.113.7")).toBe("203.0.113.7");
    expect(clientKey("2001:db8:1:2:aaaa::1")).toBe("2001:db8:1:2::/64");
    expect(clientKey("2001:0db8:0001:0002:ffff:ffff:ffff:ffff")).toBe("2001:db8:1:2::/64");
    expect(clientKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(clientKey("::1")).toBe("0:0:0:0::/64");
  });
});
