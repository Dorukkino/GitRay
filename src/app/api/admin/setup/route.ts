/**
 * One-time admin setup. Allowed only when no admin account exists yet AND the
 * request carries the correct ADMIN_SETUP_TOKEN (set in the hosting env), so a
 * stranger who finds /dorukadm cannot claim the account. Creates the single
 * account (scrypt-hashed password) and starts a session.
 */

import { timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

import { getAdminStore } from "@/lib/admin-store";
import { ADMIN_COOKIE, SESSION_MAX_AGE_SECONDS, hashPassword, signSession, validPassword, validUsername } from "@/lib/admin-auth";
import { logError } from "@/lib/log";
import { getRateStore } from "@/lib/rate-store";
import { clientIp } from "@/lib/request";
import { clientKey } from "@/lib/scan-service";
import { secureCookies, signingSecret } from "@/lib/secret";

export const runtime = "nodejs";

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 10;
const headers = { "Cache-Control": "no-store" };

function fail(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers });
}

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const store = getAdminStore();
  const setupToken = process.env.ADMIN_SETUP_TOKEN;
  if (!store.configured || !signingSecret()) return fail(503, "unavailable", "The admin panel is not configured.");
  if (!setupToken) return fail(403, "setup_disabled", "Setup is not enabled.");

  const key = clientKey(clientIp(request));
  try {
    if ((await getRateStore().hit("admin-setup", key, WINDOW_MS, Date.now())) > MAX_PER_WINDOW) {
      return fail(429, "rate_limited", "Too many attempts. Please try again later.");
    }
  } catch (e) {
    logError("admin setup rate limit", e);
  }

  if (await store.exists()) return fail(403, "already_setup", "An admin account already exists.");

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return fail(400, "bad_request", "Invalid request.");
  if (typeof body.setupToken !== "string" || !tokenMatches(body.setupToken, setupToken)) {
    return fail(403, "bad_token", "The setup key is wrong.");
  }
  if (!validUsername(body.username)) return fail(400, "bad_username", "Username must be 3-32 letters, digits, . _ or -.");
  if (!validPassword(body.password)) return fail(400, "bad_password", "Password must be at least 10 characters.");

  const { hash, salt } = hashPassword(body.password);
  let created: boolean;
  try {
    created = await store.create(body.username, hash, salt, new Date());
  } catch (e) {
    logError("admin setup create", e);
    return fail(503, "unavailable", "Could not create the account. Please try again.");
  }
  if (!created) return fail(409, "already_setup", "An admin account already exists.");

  const session = signSession();
  if (!session) return fail(503, "unavailable", "The admin panel is not configured.");
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, session, { httpOnly: true, secure: secureCookies(), sameSite: "strict", path: "/", maxAge: SESSION_MAX_AGE_SECONDS });
  return Response.json({ ok: true }, { headers });
}
