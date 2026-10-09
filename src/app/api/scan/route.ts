import type { NextRequest } from "next/server";

import { runScan } from "@/lib/scan-service";

// Downloading and scanning a large repository can take a while; the engine
// stops itself earlier (Limits.timeBudgetMs) and reports a partial scan.
export const maxDuration = 60;

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

/**
 * GET /api/scan?repo=owner/name[&fresh=1]: scan a public GitHub repository and
 * return the JSON report. A recent stored result is returned unless fresh=1.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const fresh = params.get("fresh") === "1";
  const outcome = await runScan(params.get("repo") ?? "", clientIp(request), undefined, { fresh });
  const headers: Record<string, string> = {
    "Cache-Control":
      outcome.status === 200 && !fresh ? "public, max-age=0, s-maxage=60, stale-while-revalidate=60" : "no-store",
    "X-GitRay-Cache": outcome.cached ? "hit" : "miss",
  };
  return Response.json(outcome.body, { status: outcome.status, headers });
}
