/** Plain data types shared by the engine, the CLI and the web app. */

import type { Submodule } from "./submodules";

export type Verdict = "clean" | "suspicious" | "dangerous" | "incomplete";

export type Category =
  | "autorun"
  | "code"
  | "obfuscation"
  | "links"
  | "social"
  | "binary"
  | "repo"
  | "dependencies"
  | "ci";

export interface RepoRef {
  readonly owner: string;
  readonly repo: string;
}

export interface ReleaseAsset {
  releaseTag: string;
  name: string;
  size: number;
  /** "sha256:<hex>" as reported by the GitHub API; null when GitHub has none. */
  digest: string | null;
}

export interface RepoInfo {
  /** Canonical "owner/repo" as reported by GitHub (the request may use an old name). */
  fullName: string;
  description: string | null;
  sizeKb: number;
  createdAt: string;
  pushedAt: string | null;
  defaultBranch: string;
  headSha: string;
  stars: number;
  forks: number;
  isFork: boolean;
  archived: boolean;
  ownerLogin: string;
  ownerType: string;
  ownerCreatedAt: string | null;
  releaseAssets: ReleaseAsset[];
}

export interface TextFile {
  path: string;
  content: string;
  truncated: boolean;
}

export interface BinaryFile {
  path: string;
  /** The first bytes of the file (bounded by Limits.maxFileBytes). */
  head: Uint8Array;
  size: number;
}

/** What rules may know about the scan besides the file itself. */
export interface ScanContext {
  repo: RepoRef | null;
  info: RepoInfo | null;
  now: Date;
  /** Files in the commit that GitHub's tarball leaves out (.gitattributes export-ignore). */
  exportIgnored?: string[];
  /** Declared dependencies that OSV lists as malicious packages. */
  maliciousDependencies?: MaliciousDependency[];
}

export interface MaliciousDependency {
  ecosystem: "npm" | "PyPI";
  name: string;
  /** The malicious version installed, or null when every version is malicious. */
  version: string | null;
  /** OSV record IDs (MAL-...). */
  ids: string[];
  /** Where the dependency is declared. */
  path: string;
  line: number;
  text: string;
}

/** Result of checking the declared dependencies against OSV's malicious-package records. */
export interface DependencyCheck {
  /**
   * ok: nothing known to be malicious. found: malicious packages declared.
   * none: no manifests or lockfiles. skipped: not checked (no OSV client).
   * unavailable: OSV could not be reached.
   */
  status: "ok" | "found" | "none" | "skipped" | "unavailable";
  /** Distinct packages checked. */
  packages: number;
  malicious: number;
}

export interface Finding {
  ruleId: string;
  title: string;
  category: Category;
  /** Path inside the repository; "" for repository-level findings. */
  path: string;
  /** 1-based line; 0 for binary files and repository-level findings. */
  line: number;
  snippet: string;
  why: string;
  weight: number;
  /** The rule fired inside a documentation file and was down-weighted. */
  docContext: boolean;
  note: string | null;
}

export interface ScanStats {
  entriesSeen: number;
  textFiles: number;
  binaryFiles: number;
  skippedNonRegular: number;
  truncatedFiles: number;
  downloadedBytes: number;
  decompressedBytes: number;
  /** ZIP files whose contents were read, and those that could not be (too large, ZIP64, damaged). */
  archivesOpened: number;
  archivesSkipped: number;
  /** Files read from inside ZIPs, and those skipped (encrypted, unsupported method, over a limit). */
  archiveMembers: number;
  archiveMembersSkipped: number;
  archiveBytes: number;
}

/**
 * GitHub's tarball honours .gitattributes export-ignore, so a file can reach
 * everyone who runs "git clone" yet be missing from the archive GitRay reads.
 * The scan compares the archive with the commit's file list to catch that.
 */
export interface ArchiveCheck {
  /**
   * ok: the archive holds every file. hidden: some files were missing and were
   * fetched separately. skipped: not checked (partial scan, or no repository).
   * unavailable: GitHub did not return the full file list.
   */
  status: "ok" | "hidden" | "skipped" | "unavailable";
  hidden: number;
  scanned: number;
}

/** Why a scan stopped early: the limit that was exceeded and its value. */
export interface PartialScan {
  limit: string;
  limitValue: number;
  reason: string;
}

export interface ScanResult {
  repo: RepoInfo | null;
  findings: Finding[];
  score: number;
  verdict: Verdict;
  /** Contribution of each rule to the score (its highest finding weight). */
  ruleScores: Record<string, number>;
  stats: ScanStats;
  partial: PartialScan | null;
  archiveCheck: ArchiveCheck;
  dependencyCheck: DependencyCheck;
  /** Test files alone would have made the repository dangerous; the verdict was held at suspicious. */
  testFilesCapped: boolean;
  /** Git submodules from .gitmodules: other repositories "git clone --recursive" adds, not scanned. */
  submodules: Submodule[];
  rulesRun: string[];
  startedAt: string;
  durationMs: number;
}

export function emptyStats(): ScanStats {
  return {
    entriesSeen: 0,
    textFiles: 0,
    binaryFiles: 0,
    skippedNonRegular: 0,
    truncatedFiles: 0,
    downloadedBytes: 0,
    decompressedBytes: 0,
    archivesOpened: 0,
    archivesSkipped: 0,
    archiveMembers: 0,
    archiveMembersSkipped: 0,
    archiveBytes: 0,
  };
}
