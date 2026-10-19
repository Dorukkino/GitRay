/** Shared request helpers for the API routes. */

import type { NextRequest } from "next/server";

/**
 * The client's IP for rate limiting. A reverse proxy in front of the app sets
 * `x-real-ip` to the real client IP, which the caller cannot spoof, so it is
 * preferred. The leftmost `x-forwarded-for` hop is caller-controlled (a client
 * can prepend its own value before the proxy appends the real one), so it is
 * only a fallback for local runs or proxies that do not set `x-real-ip`.
 */
export function clientIp(request: NextRequest): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}
