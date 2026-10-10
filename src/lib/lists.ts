/** Loads the public lists and counts from the store without ever failing the page. */

import { logError } from "./log";
import { type ListedVerdict, type ScanSummary, getScanStore } from "./scan-store";

export const LIST_LIMIT = 50;

export async function loadList(
  verdict: ListedVerdict,
  limit = LIST_LIMIT,
): Promise<{ items: ScanSummary[]; configured: boolean; failed: boolean }> {
  const store = getScanStore();
  try {
    return { items: await store.list(verdict, limit), configured: store.configured, failed: false };
  } catch (e) {
    logError("list query failed", e);
    return { items: [], configured: store.configured, failed: true };
  }
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Repositories scanned in the last 7 days, or null without a database or when the query fails. */
export async function loadWeeklyCount(now = Date.now()): Promise<number | null> {
  const store = getScanStore();
  if (!store.configured) return null;
  try {
    return await store.countSince(new Date(now - WEEK_MS));
  } catch (e) {
    logError("weekly count query failed", e);
    return null;
  }
}

/** How many scans the home page lists. */
export const HOME_RECENT_LIMIT = 7;

/** The latest scans for the home page with the time they were loaded, or null without a database or when the query fails. */
export async function loadRecent(limit = HOME_RECENT_LIMIT, now = Date.now()): Promise<{ items: ScanSummary[]; at: number } | null> {
  const store = getScanStore();
  if (!store.configured) return null;
  try {
    return { items: await store.list("all", limit), at: now };
  } catch (e) {
    logError("recent list query failed", e);
    return null;
  }
}
