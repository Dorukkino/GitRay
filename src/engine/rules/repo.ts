/**
 * GR-REPO-*: signals from repository metadata. Weak on their own (they never
 * make a repository suspicious by themselves) but typical of throwaway accounts
 * that push fake projects.
 */

import type { RepoInfo, ScanContext } from "../types";
import type { Hit, Rule } from "./base";

const DAY_MS = 24 * 60 * 60 * 1000;
export const NEW_ACCOUNT_DAYS = 30;
export const NEW_REPO_DAYS = 14;

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

const NEW_REPO: Rule = {
  id: "GR-REPO-002",
  title: "Repository was created very recently",
  category: "repo",
  weight: 5,
  why:
    "Malware campaigns create fresh repositories (often copies of popular projects) and " +
    "promote them before anyone looks closely. A weak signal that only matters together " +
    "with other findings.",
  *scanRepo(info: RepoInfo, ctx: ScanContext): Iterable<Hit> {
    const days = ageDays(info.createdAt, ctx.now);
    if (days !== null && days < NEW_REPO_DAYS) {
      yield { line: 0, text: "", note: `repository was created ${plural(days, "day")} ago` };
    }
  },
};

export const RULES: readonly Rule[] = [NEW_ACCOUNT, NEW_REPO];
