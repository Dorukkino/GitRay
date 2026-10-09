import { describe, expect, it } from "vitest";

import { GitHubError, LimitExceeded } from "../src/engine/errors";
import { GitHubClient } from "../src/engine/github";
import { DEFAULT_LIMITS } from "../src/engine/limits";
import { FakeGitHub, SHA, collect } from "./helpers";

const ref = { owner: "octo", repo: "demo" };

function client(gh: FakeGitHub, token?: string) {
  return new GitHubClient({ fetch: gh.fetch, token });
}

describe("GitHubClient.getRepoInfo", () => {
  it("collects metadata, the head commit and release digests", async () => {
    const gh = new FakeGitHub();
    gh.releases = [
      {
        tag_name: "v1",
        assets: [
          { name: "tool.zip", size: 10, digest: `sha256:${"a".repeat(64)}` },
          { name: "old.exe", size: 5 },
        ],
      },
    ];
    const info = await client(gh).getRepoInfo(ref);
    expect(info).toMatchObject({
      fullName: "octo/demo",
      defaultBranch: "main",
      headSha: SHA,
      stars: 3,
      ownerCreatedAt: "2015-05-05T00:00:00Z",
      releaseAssets: [
        { releaseTag: "v1", name: "tool.zip", size: 10, digest: `sha256:${"a".repeat(64)}` },
        { releaseTag: "v1", name: "old.exe", size: 5, digest: null },
      ],
    });
  });

  it("follows a rename inside api.github.com and continues with the canonical name", async () => {
    const gh = new FakeGitHub();
    gh.overrides.set("/repos/octo/old-name", () =>
      new Response(null, { status: 301, headers: { Location: "https://api.github.com/repos/octo/demo" } }),
    );
    const info = await client(gh).getRepoInfo({ owner: "octo", repo: "old-name" });
    expect(info.fullName).toBe("octo/demo");
    expect(gh.requests.some((r) => r.url.pathname === "/repos/octo/demo/commits/main")).toBe(true);
  });

  it("refuses redirects that leave api.github.com and redirect loops", async () => {
    const gh = new FakeGitHub();
    gh.overrides.set("/repos/octo/demo", () =>
      new Response(null, { status: 302, headers: { Location: "https://evil.example/repos/octo/demo" } }),
    );
    await expect(client(gh).getRepoInfo(ref)).rejects.toThrow(/outside api.github.com/);

    const loop = new FakeGitHub();
    loop.overrides.set("/repos/octo/demo", () =>
      new Response(null, { status: 301, headers: { Location: "/repos/octo/demo" } }),
    );
    await expect(client(loop).getRepoInfo(ref)).rejects.toThrow(/too many redirects/);
  });

  it("maps GitHub errors to codes", async () => {
    const missing = new FakeGitHub();
    missing.overrides.set("/repos/octo/demo", () => Response.json({}, { status: 404 }));
    await expect(client(missing).getRepoInfo(ref)).rejects.toMatchObject({ code: "not_found" });

    const limited = new FakeGitHub();
    limited.overrides.set("/repos/octo/demo", () =>
      Response.json({}, { status: 403, headers: { "x-ratelimit-remaining": "0" } }),
    );
    await expect(client(limited).getRepoInfo(ref)).rejects.toMatchObject({ code: "rate_limited" });

    const priv = new FakeGitHub();
    priv.repo = { ...priv.repo, private: true };
    await expect(client(priv).getRepoInfo(ref)).rejects.toMatchObject({ code: "private" });
  });

  it("rejects malformed responses", async () => {
    const gh = new FakeGitHub();
    gh.overrides.set(`/repos/octo/demo/commits/main`, () => new Response("not-a-sha"));
    await expect(client(gh).getRepoInfo(ref)).rejects.toBeInstanceOf(GitHubError);

    const bad = new FakeGitHub();
    bad.repo = { ...bad.repo, full_name: "../../etc" };
    await expect(client(bad).getRepoInfo(ref)).rejects.toThrow(/Unexpected repository response/);
  });

  it("explains a rejected server token", async () => {
    const gh = new FakeGitHub();
    gh.overrides.set("/repos/octo/demo", () => Response.json({ message: "Bad credentials" }, { status: 401 }));
    await expect(client(gh).getRepoInfo(ref)).rejects.toThrow(/GITHUB_TOKEN is invalid or expired/);
  });

  it("stops metadata lookups when the scan budget is spent", async () => {
    const gh = new FakeGitHub();
    const controller = new AbortController();
    controller.abort();
    await expect(client(gh).getRepoInfo(ref, controller.signal)).rejects.toThrow(/time budget/);
  });

  it("tolerates a missing owner profile", async () => {
    const gh = new FakeGitHub();
    gh.overrides.set("/users/octo", () => Response.json({}, { status: 403 }));
    expect((await client(gh).getRepoInfo(ref)).ownerCreatedAt).toBeNull();
  });

  it("sends the token to api.github.com only", async () => {
    const gh = new FakeGitHub();
    const c = client(gh, "secret-token");
    const info = await c.getRepoInfo(ref);
    await collect(await c.streamTarball(info, DEFAULT_LIMITS));
    for (const r of gh.requests) {
      const auth = r.headers.get("authorization");
      if (r.url.hostname === "api.github.com") expect(auth).toBe("Bearer secret-token");
      else expect(auth).toBeNull();
    }
    expect(gh.requests.some((r) => r.url.hostname === "codeload.github.com")).toBe(true);
  });
});

describe("GitHubClient.streamTarball", () => {
  it("only follows the tarball redirect to GitHub download hosts", async () => {
    const gh = new FakeGitHub();
    gh.redirectTo = "https://evil.example/x.tar.gz";
    const c = client(gh);
    const info = await c.getRepoInfo(ref);
    await expect(c.streamTarball(info, DEFAULT_LIMITS)).rejects.toThrow(/unexpected host/);
  });

  it("stops before downloading when Content-Length is over the limit", async () => {
    const gh = new FakeGitHub();
    gh.overrides.set(`/octo/demo/legacy.tar.gz/${SHA}`, () =>
      new Response("x", { headers: { "content-length": String(10 * 1024 * 1024 * 1024) } }),
    );
    const c = client(gh);
    const info = await c.getRepoInfo(ref);
    await expect(c.streamTarball(info, DEFAULT_LIMITS)).rejects.toBeInstanceOf(LimitExceeded);
  });
});
