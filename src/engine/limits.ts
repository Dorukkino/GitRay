/** Safety limits for reading untrusted repositories. All defaults live here. */

const MiB = 1024 * 1024;

export interface Limits {
  /** Repository size reported by the GitHub API (KB, includes history; approximate). */
  maxRepoSizeKb: number;
  /** Compressed bytes downloaded from GitHub. */
  maxDownloadBytes: number;
  /** Tar entries of any type (files, directories, links). */
  maxEntries: number;
  /** Bytes read per regular file; the rest is skipped and the file marked truncated. */
  maxFileBytes: number;
  /** Decompressed bytes flowing through the tar reader, skipped content included. */
  maxTotalBytes: number;
  /** Wall-clock budget for downloading and scanning (serverless functions time out). */
  timeBudgetMs: number;
  /** ZIP files up to this size are read whole so their contents can be scanned. */
  maxArchiveBytes: number;
  /** Members read per ZIP; the rest are counted as skipped. */
  maxArchiveMembers: number;
  /** Bytes unpacked from all ZIPs of one scan together (stops zip bombs). */
  maxArchiveTotalBytes: number;
  /** A ZIP inside a ZIP is opened; a third level is not. */
  maxArchiveDepth: number;
  /** Files left out of GitHub's tarball (export-ignore) that are downloaded separately. */
  maxHiddenFiles: number;
  /** Bytes downloaded for those files together. */
  maxHiddenBytes: number;
}

export const DEFAULT_LIMITS: Readonly<Limits> = Object.freeze({
  maxRepoSizeKb: 500_000,
  maxDownloadBytes: 50 * MiB,
  maxEntries: 20_000,
  maxFileBytes: 1 * MiB,
  maxTotalBytes: 200 * MiB,
  timeBudgetMs: 45_000,
  maxArchiveBytes: 20 * MiB,
  maxArchiveMembers: 2_000,
  maxArchiveTotalBytes: 50 * MiB,
  maxArchiveDepth: 2,
  maxHiddenFiles: 300,
  maxHiddenBytes: 20 * MiB,
});

/** Size of tar extension headers (long paths) we are willing to buffer. */
export const MAX_TAR_META_BYTES = 64 * 1024;

export function withDefaults(overrides: Partial<Limits> = {}): Limits {
  return { ...DEFAULT_LIMITS, ...overrides };
}
