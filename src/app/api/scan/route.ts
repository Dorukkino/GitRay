import type { NextRequest } from "next/server";

import { runScan } from "@/lib/scan-service";

// Downloading and scanning a large repository can take a while; the engine
// stops itself earlier (Limits.timeBudgetMs) and reports a partial scan.
export const maxDuration = 60;

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

/** GET /api/scan?repo=owner/name: scan a public GitHub repository and return the JSON report. */
export async function GET(request: NextRequest) {
  const repo = request.nextUrl.searchParams.get("repo") ?? "";
  const outcome = await runScan(repo, clientIp(request));
  const headers: Record<string, string> = {
    "Cache-Control":
      outcome.status === 200 ? "public, max-age=0, s-maxage=600, stale-while-revalidate=300" : "no-store",
    "X-GitRay-Cache": outcome.cached ? "hit" : "miss",
  };
  return Response.json(outcome.body, { status: outcome.status, headers });
}
