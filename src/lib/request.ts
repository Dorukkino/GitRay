/** Shared request helpers for the API routes. */

import type { NextRequest } from "next/server";

/** The client's IP: the first x-forwarded-for hop, then x-real-ip, else "unknown". */
export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
