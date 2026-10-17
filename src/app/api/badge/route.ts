/**
 * GET /api/badge?repo=owner/name -> an SVG "security badge" for a README,
 * showing the repository's latest GiTRay verdict. It only READS the stored
 * verdict (never triggers a scan, never calls GitHub), so it is cheap and safe
 * for crawlers and image proxies, and is cacheable at the CDN.
 */

import type { NextRequest } from "next/server";

import { parseTarget } from "@/engine";
import { type BadgeStatus, badgeSvg } from "@/lib/badge";
import { getScanStore, repoKey } from "@/lib/scan-store";

export const runtime = "nodejs";

function svg(status: BadgeStatus): Response {
  return new Response(badgeSvg(status), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // Opposite of the no-store used elsewhere: a badge must be cacheable and
      // never scans, so the CDN can serve README renders without hitting us.
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

export async function GET(request: NextRequest) {
  let fullName: string;
  try {
    const ref = parseTarget(request.nextUrl.searchParams.get("repo") ?? "");
    fullName = `${ref.owner}/${ref.repo}`;
  } catch {
    return new Response("Invalid repository", { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const scan = await getScanStore()
    .latest(repoKey(fullName))
    .catch(() => null);
  return svg(scan ? scan.verdict : "not scanned");
}
