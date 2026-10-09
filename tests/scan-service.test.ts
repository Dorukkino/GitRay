import { beforeEach, describe, expect, it } from "vitest";

import { GitHubClient } from "../src/engine/github";
import { RATE_MAX, runScan, resetScanService } from "../src/lib/scan-service";
import { FakeGitHub } from "./helpers";

function deps(gh: FakeGitHub, now = () => 1_000_000) {
  return { client: () => new GitHubClient({ fetch: gh.fetch }), now };
}

describe("runScan", () => {
  beforeEach(() => resetScanService());

  it("returns a report and serves repeats from the cache", async () => {
    const gh = new FakeGitHub();
    const first = await runScan("github.com/octo/demo", "1.1.1.1", deps(gh));
    expect(first).toMatchObject({ status: 200, cached: false, body: { verdict: "clean" } });
    const calls = gh.requests.length;
    const second = await runScan("OCTO/DEMO", "1.1.1.1", deps(gh));
    expect(second.cached).toBe(true);
    expect(gh.requests.length).toBe(calls);
  });

  it("expires the cache", async () => {
    const gh = new FakeGitHub();
    let t = 1_000_000;
    await runScan("octo/demo", "ip", deps(gh, () => t));
    t += 11 * 60 * 1000;
    expect((await runScan("octo/demo", "ip", deps(gh, () => t))).cached).toBe(false);
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
