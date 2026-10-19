/** Shared request helpers for the API routes. */

import type { NextRequest } from "next/server";

/**
 * How many trusted reverse proxies sit in front of the app. One by default:
 * Coolify's Traefik (or Vercel) directly facing the internet. Put a CDN in front
 * (e.g. Cloudflare) and set TRUSTED_PROXY_HOPS=2 so the CDN's hop is not mistaken
 * for the client.
 */
function trustedProxyHops(): number {
  const n = Number(process.env.TRUSTED_PROXY_HOPS);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/**
 * The client's IP for rate limiting. The app runs behind a reverse proxy, which
 * appends the address it received the request from to the end of
 * `x-forwarded-for`. A caller can only prepend its own fake values, never forge
 * the entries the trusted proxies appended, so the real client is the
 * `hops`-th entry from the right (hops = number of trusted proxies). This is
 * why we do not simply trust `x-real-ip` or the leftmost `x-forwarded-for`:
 * both are caller-controlled unless the proxy is known to overwrite them, and
 * Traefik does not. `x-real-ip` is only a fallback for a direct connection with
 * no `x-forwarded-for` (local development).
 */
export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      const ip = parts[Math.max(0, parts.length - trustedProxyHops())];
      if (ip) return ip;
    }
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
