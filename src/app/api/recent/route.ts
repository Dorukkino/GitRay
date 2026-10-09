import { loadList } from "@/lib/lists";

/** How many scans the header's recent scans menu shows. */
const MENU_ITEMS = 6;

// Rebuilt at most once a minute like the list pages, so opening the menu does not query the database.
export const revalidate = 60;

/**
 * GET /api/recent: the latest scans, any verdict, for the header menu. Only the
 * name, verdict, score and time; names come from our own sanitized reports.
 */
export async function GET() {
  const { items, configured, failed } = await loadList("all", MENU_ITEMS);
  return Response.json({
    configured,
    failed,
    items: items.map((s) => ({ fullName: s.fullName, verdict: s.verdict, score: s.score, scannedAt: s.scannedAt })),
  });
}
