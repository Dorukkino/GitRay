import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { type ArchiveEntry, readArchive } from "../src/engine/archive";
import { ArchiveError, LimitExceeded } from "../src/engine/errors";
import { DEFAULT_LIMITS, type Limits } from "../src/engine/limits";
import { emptyStats } from "../src/engine/types";
import { ROOT, TarBuilder, chunked, collect, makeTarball } from "./helpers";

async function read(data: Uint8Array, limits: Partial<Limits> = {}, chunkSize = 64 * 1024) {
  const stats = emptyStats();
  const entries = await collect(readArchive(chunked(data, chunkSize), { ...DEFAULT_LIMITS, ...limits }, stats));
  return { entries, stats };
}

async function readUntilError(data: Uint8Array, limits: Partial<Limits>) {
  const stats = emptyStats();
  const entries: ArchiveEntry[] = [];
  let error: unknown = null;
  try {
    for await (const e of readArchive(chunked(data), { ...DEFAULT_LIMITS, ...limits }, stats)) entries.push(e);
  } catch (e) {
    error = e;
  }
  return { entries, stats, error };
}

const texts = (entries: ArchiveEntry[]) =>
  Object.fromEntries(entries.filter((e) => e.kind === "text").map((e) => [e.file.path, (e.file as { content: string }).content]));

describe("readArchive", () => {
  it("yields text files without the GitHub root folder", async () => {
    const { entries, stats } = await read(makeTarball({ "README.md": "# hi\n", "src/a.py": "print(1)\n" }));
    expect(texts(entries)).toEqual({ "README.md": "# hi\n", "src/a.py": "print(1)\n" });
    expect(stats.textFiles).toBe(2);
    expect(stats.downloadedBytes).toBeGreaterThan(0);
    expect(stats.decompressedBytes).toBeGreaterThan(stats.downloadedBytes);
  });

  it("works with any chunking of the stream", async () => {
    const data = makeTarball({ "a.txt": "x".repeat(3000), "b.txt": "y" });
    const { entries } = await read(data, {}, 7);
    expect(texts(entries)).toEqual({ "a.txt": "x".repeat(3000), "b.txt": "y" });
  });

  it("never reads symlinks, hardlinks or special files", async () => {
    const data = new TarBuilder()
      .file("real.txt", "ok")
      .symlink("link", "/etc/passwd")
      .hardlink("hard", "real.txt")
      .fifo("pipe")
      .dir("sub")
      .build();
    const { entries, stats } = await read(data);
    expect(entries.map((e) => e.file.path)).toEqual(["real.txt"]);
    expect(stats.skippedNonRegular).toBe(3);
  });

  it("reads long paths from pax and GNU headers", async () => {
    const long = `${"deep/".repeat(30)}file.js`;
    const data = new TarBuilder().file(long, "a").gnuLongName(`${"gnu/".repeat(30)}x.js`, "b").build();
    const { entries } = await read(data);
    expect(entries.map((e) => e.file.path)).toEqual([long, `${"gnu/".repeat(30)}x.js`]);
  });

  it("separates binary files and decodes UTF-16 scripts", async () => {
    const utf16 = new Uint8Array([0xff, 0xfe, ...Array.from(new TextEncoder().encode("iex")).flatMap((c) => [c, 0])]);
    const data = makeTarball({ "a.bin": new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0, 1]), "run.ps1": utf16 });
    const { entries, stats } = await read(data);
    expect(entries.find((e) => e.file.path === "a.bin")?.kind).toBe("binary");
    expect(texts(entries)["run.ps1"]).toBe("iex");
    expect(stats.binaryFiles).toBe(1);
  });

  it("truncates files over maxFileBytes and keeps going", async () => {
    const data = makeTarball({ "big.txt": "a".repeat(5000), "after.txt": "b" });
    const { entries, stats } = await read(data, { maxFileBytes: 100 });
    const big = entries.find((e) => e.file.path === "big.txt");
    expect(big?.kind === "text" && big.file.content).toBe("a".repeat(100));
    expect(big?.kind === "text" && big.file.truncated).toBe(true);
    expect(texts(entries)["after.txt"]).toBe("b");
    expect(stats.truncatedFiles).toBe(1);
  });

  it("stops at maxEntries with a LimitExceeded after yielding what it read", async () => {
    const files = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`f${i}.txt`, "x"]));
    const { entries, error } = await readUntilError(makeTarball(files), { maxEntries: 4 });
    expect(error).toBeInstanceOf(LimitExceeded);
    expect((error as LimitExceeded).limit).toBe("maxEntries");
    expect(entries.length).toBeGreaterThan(0);
  });

  it("stops gzip bombs at maxTotalBytes", async () => {
    // 50 MiB of zeros compresses to ~50 KiB.
    const data = new TarBuilder().file("bomb.bin", new Uint8Array(50 * 1024 * 1024)).build();
    expect(data.length).toBeLessThan(200 * 1024);
    const { error, stats } = await readUntilError(data, { maxTotalBytes: 1024 * 1024 });
    expect((error as LimitExceeded).limit).toBe("maxTotalBytes");
    expect(stats.decompressedBytes).toBeLessThan(2 * 1024 * 1024);
  });

  it("stops at maxDownloadBytes", async () => {
    const { error } = await readUntilError(makeTarball({ "a.txt": "x" }), { maxDownloadBytes: 10 });
    expect((error as LimitExceeded).limit).toBe("maxDownloadBytes");
  });

  it("stops when the time budget is spent", async () => {
    const stats = emptyStats();
    const it = readArchive(chunked(makeTarball({ "a.txt": "x" })), DEFAULT_LIMITS, stats, Date.now() - 1);
    await expect(collect(it)).rejects.toMatchObject({ limit: "timeBudgetMs" });
  });

  it("rejects invalid gzip, bad checksums and truncated archives", async () => {
    await expect(read(new TextEncoder().encode("not gzip"))).rejects.toBeInstanceOf(ArchiveError);
    await expect(read(new Uint8Array(0))).rejects.toBeInstanceOf(ArchiveError);

    const tar = new TarBuilder().file("a.txt", "hello").tar();
    const corrupt = tar.slice();
    // Global pax header + its body + the root folder come first; "a.txt" starts at 1536.
    corrupt[1536 + 2] ^= 0xff;
    await expect(read(new Uint8Array(gzipSync(corrupt)))).rejects.toThrow(/checksum/);

    const cutContent = tar.slice(0, 1536 + 512 + 2); // header, then 2 of 5 content bytes
    await expect(read(new Uint8Array(gzipSync(cutContent)))).rejects.toThrow(/truncated/);
    const cutHeader = tar.slice(0, 1536 + 100);
    await expect(read(new Uint8Array(gzipSync(cutHeader)))).rejects.toThrow(/truncated/);
  });

  it("never yields the root folder itself", async () => {
    const data = new TarBuilder().raw(ROOT.slice(0, -1), "0", new TextEncoder().encode("x")).build();
    const { entries } = await read(data);
    expect(entries).toEqual([]);
  });
});
