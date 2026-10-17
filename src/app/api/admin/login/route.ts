/**
 * Admin login. Requires the robot check, rate-limits attempts by IP, and
 * verifies the password with a constant-time scrypt comparison. On success it
 * sets the signed session cookie. Failures are generic (no user enumeration).
 */

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

import { getAdminStore } from "@/lib/admin-store";
import { ADMIN_COOKIE, SESSION_MAX_AGE_SECONDS, signSession, validPassword, verifyPassword } from "@/lib/admin-auth";
import { CAPTCHA_COOKIE, verifyCaptcha } from "@/lib/captcha";
import { logError } from "@/lib/log";
import { getRateStore } from "@/lib/rate-store";
import { clientIp } from "@/lib/request";
import { clientKey } from "@/lib/scan-service";
import { secureCookies, signingSecret } from "@/lib/secret";

export const runtime = "nodejs";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const headers = { "Cache-Control": "no-store" };

function fail(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers });
}

export async function POST(request: NextRequest) {
  const store = getAdminStore();
  if (!store.configured || !signingSecret()) return fail(503, "unavailable", "The admin panel is not configured.");

  const key = clientKey(clientIp(request));
  try {
    if ((await getRateStore().hit("admin-login", key, WINDOW_MS, Date.now())) > MAX_ATTEMPTS) {
      return fail(429, "rate_limited", "Too many attempts. Please try again in a few minutes.");
    }
  } catch (e) {
    logError("admin login rate limit", e);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return fail(400, "bad_request", "Invalid request.");

  const jar = await cookies();
  const answer = typeof body.captchaAnswer === "string" ? body.captchaAnswer : undefined;
  if (!verifyCaptcha(jar.get(CAPTCHA_COOKIE)?.value, answer, "login")) {
    return fail(400, "captcha_failed", "The robot check was wrong or expired. Please try again.");
  }

  let admin;
  try {
    admin = await store.get();
  } catch (e) {
    logError("admin login lookup", e);
    return fail(503, "unavailable", "Could not sign you in. Please try again.");
  }
  if (!admin) return fail(409, "needs_setup", "No admin account exists yet.");

  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";
  // Run the scrypt check whenever the password is a plausible length, regardless
  // of the username, so response time never reveals whether the username is
  // valid; an over-length password is rejected before hashing (no CPU waste).
  const passwordOk = validPassword(password) && verifyPassword(password, admin.salt, admin.passwordHash);
  if (!(passwordOk && username === admin.username)) return fail(401, "invalid", "Wrong username or password.");

  const session = signSession();
  if (!session) return fail(503, "unavailable", "The admin panel is not configured.");
  jar.set(ADMIN_COOKIE, session, { httpOnly: true, secure: secureCookies(), sameSite: "strict", path: "/", maxAge: SESSION_MAX_AGE_SECONDS });
  return Response.json({ ok: true }, { headers });
}
