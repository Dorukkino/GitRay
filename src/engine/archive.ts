/**
 * Read a gzipped tarball from a byte stream, in memory, with hard limits.
 *
 * Nothing is ever written to disk and nothing from the archive is executed:
 *
 *   raw chunks -> count compressed bytes -> gunzip -> count decompressed bytes
 *   -> tar parser (ours, ~150 lines) -> text or binary entries
 *
 * Every decompressed byte, including content we skip, passes through the
 * counter. This is what stops gzip bombs. Symlinks, hardlinks and special
 * files are never followed or read.
 */

import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";

import { ArchiveError, GitRayError, LimitExceeded } from "./errors";
import { MAX_TAR_META_BYTES, type Limits } from "./limits";
import { isLockfile } from "./deps";
import { decode } from "./text";
import type { BinaryFile, ScanStats, TextFile } from "./types";
import { isZipPath } from "./zip";

const BLOCK = 512;

export type ArchiveEntry = { kind: "text"; file: TextFile } | { kind: "binary"; file: BinaryFile };

export async function* countBytes(
  source: AsyncIterable<Uint8Array>,
  limit: number,
  limitName: keyof Limits,
  label: string,
  onCount: (total: number) => void,
): AsyncGenerator<Uint8Array> {
  let total = 0;
  for await (const chunk of source) {
    total += chunk.byteLength;
    onCount(total);
    if (total > limit) throw new LimitExceeded(limitName, limit, `${label} exceeded ${limit} bytes`);
    yield chunk;
  }
}

/** Decompress a gzip stream lazily: output is produced only as fast as it is consumed. */
export async function* gunzip(source: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
  const input = Readable.from(source, { objectMode: false });
  const z = createGunzip({ chunkSize: 64 * 1024 });
  input.on("error", (e) => z.destroy(e));
  input.pipe(z);
  try {
    for await (const out of z) yield out as Uint8Array;
  } catch (e) {
    if (e instanceof GitRayError) throw e;
    throw new ArchiveError(`invalid gzip data: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    input.destroy();
    z.destroy();
  }
}

/** Pulls exact byte counts out of an async chunk stream. */
class ByteReader {
  private chunks: Uint8Array[] = [];
  private buffered = 0;
  private readonly it: AsyncIterator<Uint8Array>;

  constructor(source: AsyncIterable<Uint8Array>) {
    this.it = source[Symbol.asyncIterator]();
  }

  private async pull(): Promise<boolean> {
    const r = await this.it.next();
    if (r.done) return false;
    if (r.value.byteLength > 0) {
      this.chunks.push(r.value);
      this.buffered += r.value.byteLength;
    }
    return true;
  }

  /** Exactly n bytes, or null if the stream ends first. */
  async read(n: number): Promise<Uint8Array | null> {
    while (this.buffered < n) if (!(await this.pull())) return null;
    const out = new Uint8Array(n);
    let off = 0;
    while (off < n) {
      const first = this.chunks[0];
      const k = Math.min(first.byteLength, n - off);
      out.set(first.subarray(0, k), off);
      off += k;
      if (k === first.byteLength) this.chunks.shift();
      else this.chunks[0] = first.subarray(k);
    }
    this.buffered -= n;
    return out;
  }

  /** Discard n bytes without buffering them. False if the stream ends first. */
  async skip(n: number): Promise<boolean> {
    let rest = n;
    while (rest > 0) {
      if (this.buffered === 0 && !(await this.pull())) return false;
      if (this.buffered === 0) continue;
      const first = this.chunks[0];
      if (first.byteLength <= rest) {
        this.chunks.shift();
        this.buffered -= first.byteLength;
        rest -= first.byteLength;
      } else {
        this.chunks[0] = first.subarray(rest);
        this.buffered -= rest;
        rest = 0;
      }
    }
    return true;
  }

  /** Bytes received but not consumed yet. */
  get pending(): number {
    return this.buffered;
  }

  async close(): Promise<void> {
    await this.it.return?.();
  }
}

const utf8 = new TextDecoder("utf-8");

function cString(b: Uint8Array): string {
  const end = b.indexOf(0);
  return utf8.decode(end === -1 ? b : b.subarray(0, end));
}

function parseNumber(b: Uint8Array): number {
  // GNU base-256 encoding for large values: high bit of the first byte set.
  if (b[0] & 0x80) {
    let n = b[0] & 0x7f;
    for (let i = 1; i < b.length; i++) n = n * 256 + b[i];
    return n;
  }
  const s = cString(b).trim();
  if (!s) return 0;
  if (!/^[0-7]+$/.test(s)) throw new ArchiveError("invalid tar header number");
  return parseInt(s, 8);
}

function checksumOk(h: Uint8Array): boolean {
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 32 : h[i];
  return sum === parseNumber(h.subarray(148, 156));
}

/** Records of a pax extended header: "<len> key=value\n". */
function parsePax(body: Uint8Array): Map<string, string> {
  const out = new Map<string, string>();
  const text = utf8.decode(body);
  let i = 0;
  while (i < text.length) {
    const space = text.indexOf(" ", i);
    if (space === -1) break;
    const len = Number(text.slice(i, space));
    if (!Number.isInteger(len) || len <= 0) break;
    // Lengths count bytes; GitHub paths are mostly ASCII, so fall back to the newline.
    const end = text.indexOf("\n", space);
    if (end === -1) break;
    const record = text.slice(space + 1, end);
    const eq = record.indexOf("=");
    if (eq > 0) out.set(record.slice(0, eq), record.slice(eq + 1));
    i = end + 1;
  }
  return out;
}

/** GitHub tarballs wrap everything in "<owner>-<repo>-<sha>/". */
function stripRoot(name: string): string {
  const i = name.indexOf("/");
  return i === -1 ? "" : name.slice(i + 1).replace(/\/+$/, "");
}

const padding = (size: number): number => (BLOCK - (size % BLOCK)) % BLOCK;

/**
 * Iterate the regular files of a gzipped tarball. Throws LimitExceeded
 * mid-iteration; entries yielded so far stay valid, so callers can report a
 * partial scan. `stats` is updated in place. `seen` collects the path of every
 * entry (links and directories included), to compare with the commit's files.
 */
export async function* readArchive(
  chunks: AsyncIterable<Uint8Array>,
  limits: Limits,
  stats: ScanStats,
  deadline = Number.POSITIVE_INFINITY,
  seen?: Set<string>,
): AsyncGenerator<ArchiveEntry> {
  const compressed = countBytes(chunks, limits.maxDownloadBytes, "maxDownloadBytes", "download size", (n) => {
    stats.downloadedBytes = n;
  });
  const decompressed = countBytes(gunzip(compressed), limits.maxTotalBytes, "maxTotalBytes", "decompressed size", (n) => {
    stats.decompressedBytes = n;
  });
  const reader = new ByteReader(decompressed);
  try {
    yield* readTar(reader, limits, stats, deadline, seen);
  } finally {
    await reader.close();
  }
}

async function readBody(reader: ByteReader, size: number): Promise<Uint8Array> {
  const data = await reader.read(size);
  if (data === null || !(await reader.skip(padding(size)))) throw new ArchiveError("truncated tar data");
  return data;
}

async function skipBody(reader: ByteReader, size: number): Promise<void> {
  if (!(await reader.skip(size + padding(size)))) throw new ArchiveError("truncated tar data");
}

async function* readTar(
  reader: ByteReader,
  limits: Limits,
  stats: ScanStats,
  deadline: number,
  seen: Set<string> | undefined,
): AsyncGenerator<ArchiveEntry> {
  let longName: string | null = null;
  let paxPath: string | null = null;
  let paxSize: number | null = null;

  for (;;) {
    if (Date.now() > deadline) {
      throw new LimitExceeded("timeBudgetMs", limits.timeBudgetMs, "time budget for the scan ran out");
    }
    const header = await reader.read(BLOCK);
    if (header === null && reader.pending > 0) throw new ArchiveError("truncated tar data");
    // A zero block (or the end of the stream) marks the end of the archive.
    if (header === null || header.every((b) => b === 0)) return;
    if (!checksumOk(header)) throw new ArchiveError("invalid tar header checksum");

    const type = String.fromCharCode(header[156] || 0x30);
    const headerSize = parseNumber(header.subarray(124, 136));

    // Extension headers describe the next entry.
    if (type === "x" || type === "g" || type === "L" || type === "K") {
      if (headerSize > MAX_TAR_META_BYTES) {
        await skipBody(reader, headerSize);
        continue;
      }
      const body = await readBody(reader, headerSize);
      if (type === "x") {
        const pax = parsePax(body);
        paxPath = pax.get("path") ?? paxPath;
        const s = pax.get("size");
        paxSize = s !== undefined && /^\d+$/.test(s) ? Number(s) : paxSize;
      } else if (type === "L") {
        longName = cString(body);
      }
      continue;
    }

    const ustar = cString(header.subarray(257, 263)) === "ustar";
    const prefix = ustar ? cString(header.subarray(345, 500)) : "";
    const headerName = cString(header.subarray(0, 100));
    const name = paxPath ?? longName ?? (prefix ? `${prefix}/${headerName}` : headerName);
    const size = paxSize ?? headerSize;
    longName = paxPath = paxSize = null;

    stats.entriesSeen += 1;
    if (stats.entriesSeen > limits.maxEntries) {
      throw new LimitExceeded("maxEntries", limits.maxEntries, `archive has more than ${limits.maxEntries} entries`);
    }

    const path = stripRoot(name);
    if (path) seen?.add(path);
    const regular = type === "0" || type === "7";
    if (!regular) {
      // Directories are expected; links, devices and FIFOs are never read.
      if (type !== "5") stats.skippedNonRegular += 1;
      await skipBody(reader, size);
      continue;
    }

    // ZIPs and lockfiles are read whole (up to maxArchiveBytes): a ZIP's directory is at
    // its end, and a lockfile cut short is no longer valid JSON or YAML.
    const whole = isZipPath(path) || isLockfile(path);
    const keep = Math.min(size, whole ? Math.max(limits.maxFileBytes, limits.maxArchiveBytes) : limits.maxFileBytes);
    const data = await reader.read(keep);
    if (data === null || !(await reader.skip(size - keep + padding(size)))) {
      throw new ArchiveError("truncated tar data");
    }
    if (!path) continue;
    const truncated = size > keep;
    if (truncated) stats.truncatedFiles += 1;

    const decoded = decode(data);
    if (decoded === null) {
      stats.binaryFiles += 1;
      yield { kind: "binary", file: { path, head: data, size } };
    } else {
      stats.textFiles += 1;
      yield { kind: "text", file: { path, content: decoded.text, truncated } };
    }
  }
}
