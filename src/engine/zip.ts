/**
 * Read the contents of ZIP files found in a repository, in memory, with limits.
 *
 * Malware is often shipped as a ZIP next to harmless-looking code. Members are
 * unpacked into memory only and scanned like any other file; nothing is
 * written to disk or run. The ZIP's central directory is used to list members,
 * and every unpacked byte counts against Limits.maxArchiveTotalBytes, so a zip
 * bomb stops the expansion instead of exhausting memory. Encrypted members,
 * symlinks and unsupported compression methods are skipped and counted.
 */

import { createInflateRaw } from "node:zlib";

import type { ArchiveEntry } from "./archive";
import { LimitExceeded } from "./errors";
import type { Limits } from "./limits";
import { decode } from "./text";
import type { ScanStats } from "./types";

/** Separates the ZIP's path from the member's path: "release.zip!/setup/install.js". */
export const ARCHIVE_SEPARATOR = "!/";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const STORED = 0;
const DEFLATED = 8;

const u16 = (b: Uint8Array, o: number): number => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number): number => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000;

export interface ZipMember {
  name: string;
  method: number;
  flags: number;
  compressedSize: number;
  size: number;
  localOffset: number;
  isDirectory: boolean;
  isSymlink: boolean;
}

export function isZipPath(path: string): boolean {
  return path.toLowerCase().endsWith(".zip");
}

export function looksLikeZip(data: Uint8Array): boolean {
  return data.length >= 4 && u32(data, 0) === LOCAL_SIGNATURE;
}

/** List members from the central directory, or null for ZIP64, damaged or cut-off archives. */
export function readCentralDirectory(b: Uint8Array): ZipMember[] | null {
  // The end-of-central-directory record is in the last 22 bytes plus a comment of up to 64 KB.
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) {
    if (u32(b, i) === EOCD_SIGNATURE) {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  const total = u16(b, end + 10);
  const size = u32(b, end + 12);
  const offset = u32(b, end + 16);
  if (total === 0xffff || offset === 0xffffffff || offset + size > end) return null;

  const members: ZipMember[] = [];
  let o = offset;
  for (let i = 0; i < total; i++) {
    if (o + 46 > b.length || u32(b, o) !== CENTRAL_SIGNATURE) return null;
    const madeByUnix = b[o + 5] === 3;
    const nameLength = u16(b, o + 28);
    if (o + 46 + nameLength > b.length) return null;
    const name = new TextDecoder().decode(b.subarray(o + 46, o + 46 + nameLength));
    const unixMode = Math.floor(u32(b, o + 38) / 0x10000);
    members.push({
      name,
      flags: u16(b, o + 8),
      method: u16(b, o + 10),
      compressedSize: u32(b, o + 20),
      size: u32(b, o + 24),
      localOffset: u32(b, o + 42),
      isDirectory: name.endsWith("/"),
      isSymlink: madeByUnix && (unixMode & 0xf000) === 0xa000,
    });
    o += 46 + nameLength + u16(b, o + 30) + u16(b, o + 32);
  }
  return members;
}

/** The compressed bytes of a member, or null when its local header does not add up. */
function memberData(b: Uint8Array, m: ZipMember): Uint8Array | null {
  const o = m.localOffset;
  if (m.compressedSize === 0xffffffff || o + 30 > b.length || u32(b, o) !== LOCAL_SIGNATURE) return null;
  const start = o + 30 + u16(b, o + 26) + u16(b, o + 28);
  const end = start + m.compressedSize;
  return end <= b.length ? b.subarray(start, end) : null;
}

/** Inflate at most `max` bytes; output is produced only as fast as it is read. */
async function inflatePrefix(data: Uint8Array, max: number): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const z = createInflateRaw({ chunkSize: 64 * 1024 });
  const parts: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  z.end(data);
  try {
    for await (const chunk of z) {
      const c = chunk as Uint8Array;
      if (total + c.length > max) {
        parts.push(c.subarray(0, max - total));
        total = max;
        truncated = true;
        break;
      }
      parts.push(c);
      total += c.length;
    }
  } finally {
    z.destroy();
  }
  const bytes = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    bytes.set(p, off);
    off += p.length;
  }
  return { bytes, truncated };
}

interface ExpandOptions {
  limits: Limits;
  stats: ScanStats;
  deadline: number;
}

async function* expandZip(
  path: string,
  data: Uint8Array,
  complete: boolean,
  depth: number,
  opts: ExpandOptions,
): AsyncGenerator<ArchiveEntry> {
  const { limits, stats, deadline } = opts;
  const members = complete ? readCentralDirectory(data) : null;
  if (!members) {
    stats.archivesSkipped += 1;
    return;
  }
  stats.archivesOpened += 1;
  let read = 0;
  for (const m of members) {
    if (Date.now() > deadline) {
      throw new LimitExceeded("timeBudgetMs", limits.timeBudgetMs, "time budget for the scan ran out");
    }
    if (m.isDirectory || m.isSymlink) continue;
    const budget = limits.maxArchiveTotalBytes - stats.archiveBytes;
    const raw = memberData(data, m);
    const unsupported = (m.flags & 1) === 1 || (m.method !== STORED && m.method !== DEFLATED);
    if (read >= limits.maxArchiveMembers || budget <= 0 || unsupported || !raw) {
      stats.archiveMembersSkipped += 1;
      continue;
    }
    read += 1;
    const nested = isZipPath(m.name) && depth < limits.maxArchiveDepth;
    const max = Math.min(nested ? limits.maxArchiveBytes : limits.maxFileBytes, budget);
    let out: { bytes: Uint8Array; truncated: boolean };
    try {
      out = m.method === STORED ? { bytes: raw.subarray(0, max), truncated: raw.length > max } : await inflatePrefix(raw, max);
    } catch {
      stats.archiveMembersSkipped += 1;
      continue;
    }
    stats.archiveBytes += out.bytes.length;
    stats.archiveMembers += 1;
    const memberPath = `${path}${ARCHIVE_SEPARATOR}${m.name}`;
    const decoded = decode(out.bytes);
    if (decoded) {
      yield { kind: "text", file: { path: memberPath, content: decoded.text, truncated: out.truncated } };
      continue;
    }
    yield { kind: "binary", file: { path: memberPath, head: out.bytes, size: m.size } };
    if (nested && looksLikeZip(out.bytes)) yield* expandZip(memberPath, out.bytes, !out.truncated, depth + 1, opts);
  }
}

/**
 * Pass entries through and, after each ZIP file, its members. A ZIP is opened
 * only when it was read whole (see Limits.maxArchiveBytes).
 */
export async function* withArchiveContents(
  entries: AsyncIterable<ArchiveEntry> | Iterable<ArchiveEntry>,
  limits: Limits,
  stats: ScanStats,
  deadline = Number.POSITIVE_INFINITY,
): AsyncGenerator<ArchiveEntry> {
  for await (const entry of entries) {
    yield entry;
    const f = entry.file;
    if (entry.kind === "binary" && isZipPath(f.path) && looksLikeZip(entry.file.head)) {
      yield* expandZip(f.path, entry.file.head, entry.file.size <= entry.file.head.length, 1, { limits, stats, deadline });
    }
  }
}
