/**
 * GiTRay scanning engine. Pure TypeScript on Node.js built-ins: no web
 * framework, no database, and it never executes anything it reads.
 */

export { readArchive, type ArchiveEntry } from "./archive";
export { ArchiveError, GitHubError, GiTRayError, InvalidTarget, LimitExceeded } from "./errors";
export { GitHubClient, type GitHubClientOptions } from "./github";
export { OsvClient } from "./osv";
export { VirusTotalClient, VirusTotalError, type Reputation, type ReputationService } from "./virustotal";
export { DEFAULT_LIMITS, type Limits } from "./limits";
export {
  toReport,
  severityOf,
  type Report,
  type ReportAsset,
  type ReportCheckedFile,
  type ReportChainStep,
  type ReportFinding,
  type ReportRule,
  type ReportSubmodule,
  type Severity,
} from "./report";
export { allRules, getRule, type Rule } from "./rules";
export { NOTE_TEMPLATES, type NoteKey } from "./notes";
export { scanEntries, scanRepo, scanTarball, type ScanOptions } from "./scanner";
export { DANGEROUS_AT, SUSPICIOUS_AT } from "./scoring";
export { fullName, parseTarget } from "./target";
export type * from "./types";
export { ENGINE_VERSION } from "./version";
