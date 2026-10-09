/** Loads a public list page from the store without ever failing the page. */

import { logError } from "./log";
import { type ListedVerdict, type ScanSummary, getScanStore } from "./scan-store";

export const LIST_LIMIT = 50;

export async function loadList(verdict: ListedVerdict): Promise<{ items: ScanSummary[]; configured: boolean; failed: boolean }> {
  const store = getScanStore();
  try {
    return { items: await store.list(verdict, LIST_LIMIT), configured: store.configured, failed: false };
  } catch (e) {
    logError("list query failed", e);
    return { items: [], configured: store.configured, failed: true };
  }
}
