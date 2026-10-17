/**
 * GR-REPO-*: signals from repository metadata. Weak on their own (they never
 * make a repository suspicious by themselves) but typical of throwaway accounts
 * that push fake projects.
 */

import type { RepoInfo, ScanContext } from "../types";
import type { Hit, Rule } from "./base";

const DAY_MS = 24 * 60 * 60 * 1000;
export const NEW_ACCOUNT_DAYS = 30;

function ageDays(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((now.getTime() - t) / DAY_MS));
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

const NEW_ACCOUNT: Rule = {
  id: "GR-REPO-001",
  title: "Owner account is brand new",
  category: "repo",
  weight: 10,
  why:
    "Fake repositories are usually pushed from accounts created days earlier and abandoned " +
    "once they are reported. A new account is not a problem in itself, but it adds weight " +
    "to other findings.",
  *scanRepo(info: RepoInfo, ctx: ScanContext): Iterable<Hit> {
    const days = ageDays(info.ownerCreatedAt, ctx.now);
    if (days !== null && days < NEW_ACCOUNT_DAYS) {
      yield { line: 0, text: "", note: `account "${info.ownerLogin}" was created ${plural(days, "day")} ago` };
    }
  },
};

const ARCHIVE_GAP: Rule = {
  id: "GR-REPO-003",
  title: "Files are left out of GitHub's download archive",
  category: "repo",
  weight: 5,
  why:
    "A .gitattributes export-ignore rule keeps these files out of the archive GitHub " +
    "serves, yet \"git clone\" still delivers them. Packages often use it to drop tests, " +
    "but it is also a way to hide a payload from scanners that read the archive. GiTRay " +
    "downloads these files separately and scans them like the rest.",
  *scanRepo(_info: RepoInfo, ctx: ScanContext): Iterable<Hit> {
    const hidden = ctx.exportIgnored ?? [];
    if (hidden.length === 0) return;
    const sample = hidden.slice(0, 3).join(", ");
    yield {
      line: 0,
      text: "",
      note: `${plural(hidden.length, "file")} missing from the archive (${sample}${hidden.length > 3 ? ", ..." : ""})`,
    };
  },
};

export const RULES: readonly Rule[] = [NEW_ACCOUNT, ARCHIVE_GAP];
