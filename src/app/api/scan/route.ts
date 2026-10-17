import type { NextRequest } from "next/server";

import { clientIp } from "@/lib/request";
import { runScan } from "@/lib/scan-service";

// Downloading and scanning a large repository can take a while; the engine
// stops itself earlier (Limits.timeBudgetMs) and reports a partial scan.
export const maxDuration = 60;

/**
 * GET /api/scan?repo=owner/name[&fresh=1]: scan a public GitHub repository and
 * return the JSON report. A recent stored result is returned unless fresh=1.
 * Responses are not cached by the CDN: after "Scan again now" every visitor
 * must see the new result, and the memory and database caches keep repeats cheap.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const fresh = params.get("fresh") === "1";
  const outcome = await runScan(params.get("repo") ?? "", clientIp(request), undefined, { fresh });
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "X-GiTRay-Cache": outcome.cached ? "hit" : "miss",
  };
  return Response.json(outcome.body, { status: outcome.status, headers });
}
