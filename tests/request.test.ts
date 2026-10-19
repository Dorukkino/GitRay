/** clientIp: the real client behind a reverse proxy, resistant to x-forwarded-for spoofing. */

import type { NextRequest } from "next/server";

import { afterEach, describe, expect, it } from "vitest";

import { clientIp } from "../src/lib/request";

function req(headers: Record<string, string>): NextRequest {
  return { headers: new Headers(headers) } as unknown as NextRequest;
}

describe("clientIp", () => {
  afterEach(() => {
    delete process.env.TRUSTED_PROXY_HOPS;
  });

  it("takes the proxy-appended rightmost hop, not a spoofed prefix", () => {
    // A caller can prepend fake values; the proxy appends the real IP at the end.
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4" }))).toBe("1.2.3.4");
    expect(clientIp(req({ "x-forwarded-for": "9.9.9.9, 1.2.3.4" }))).toBe("1.2.3.4");
    expect(clientIp(req({ "x-forwarded-for": "evil, 203.0.113.7", "x-real-ip": "9.9.9.9" }))).toBe("203.0.113.7");
  });

  it("honors TRUSTED_PROXY_HOPS for a CDN in front (second hop from the right)", () => {
    process.env.TRUSTED_PROXY_HOPS = "2";
    // client -> CDN -> Traefik -> app: x-forwarded-for is [spoof, client, cdn].
    expect(clientIp(req({ "x-forwarded-for": "spoof, 1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
  });

  it("ignores a non-positive or invalid hop setting (defaults to one)", () => {
    for (const bad of ["0", "-1", "abc", ""]) {
      process.env.TRUSTED_PROXY_HOPS = bad;
      expect(clientIp(req({ "x-forwarded-for": "9.9.9.9, 1.2.3.4" }))).toBe("1.2.3.4");
    }
  });

  it("falls back to x-real-ip only when there is no x-forwarded-for", () => {
    expect(clientIp(req({ "x-real-ip": "198.51.100.5" }))).toBe("198.51.100.5");
  });

  it("returns 'unknown' when no address header is present", () => {
    expect(clientIp(req({}))).toBe("unknown");
    expect(clientIp(req({ "x-forwarded-for": " , " }))).toBe("unknown");
  });
});
