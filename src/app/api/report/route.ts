/**
 * Accepts a visitor's "this result is wrong" report. Requires the robot check,
 * rate-limits by IP, validates and sanitizes the input, and stores it privately
 * (report-store). No account, no email: just the note plus the scan's context.
 */

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

import { ENGINE_VERSION, InvalidTarget, parseTarget } from "@/engine";
import { CAPTCHA_COOKIE, verifyCaptcha } from "@/lib/captcha";
import { logError } from "@/lib/log";
import { getRateStore } from "@/lib/rate-store";
import { getReportStore } from "@/lib/report-store";
import { clientIp } from "@/lib/request";
import { sanitizeReason } from "@/lib/sanitize-text";
import { clientKey } from "@/lib/scan-service";
import { signingSecret } from "@/lib/secret";

export const runtime = "nodejs";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const VERDICTS = new Set(["clean", "suspicious", "dangerous", "incomplete"]);
const headers = { "Cache-Control": "no-store" };

function fail(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers });
}

export async function POST(request: NextRequest) {
  const store = getReportStore();
  if (!store.configured || !signingSecret()) {
    return fail(503, "storage_unavailable", "Reporting is not available right now.");
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return fail(400, "bad_request", "Invalid request.");

  const jar = await cookies();
  const answer = typeof body.captchaAnswer === "string" ? body.captchaAnswer : undefined;
  if (!verifyCaptcha(jar.get(CAPTCHA_COOKIE)?.value, answer, "report")) {
    return fail(400, "captcha_failed", "The robot check was wrong or expired. Please try again.");
  }

  let fullName: string;
  try {
    const ref = parseTarget(typeof body.repo === "string" ? body.repo : "");
    fullName = `${ref.owner}/${ref.repo}`;
  } catch (e) {
    if (e instanceof InvalidTarget) return fail(400, "bad_request", "Invalid repository.");
    throw e;
  }

  const reason = sanitizeReason(body.reason);
  if (!reason) return fail(400, "bad_reason", "Please describe what is wrong (a few words).");

  const verdict = typeof body.verdict === "string" && VERDICTS.has(body.verdict) ? body.verdict : "clean";
  const score = Number.isFinite(Number(body.score)) ? Math.max(0, Math.min(100, Math.round(Number(body.score)))) : 0;
  const headSha = typeof body.headSha === "string" && /^[0-9a-f]{40}$/i.test(body.headSha) ? body.headSha : "";
  const engineVersion = typeof body.engineVersion === "string" ? body.engineVersion.slice(0, 20) : ENGINE_VERSION;

  const key = clientKey(clientIp(request));
  const now = Date.now();
  try {
    if ((await getRateStore().hit("report", key, WINDOW_MS, now)) > MAX_PER_WINDOW) {
      return fail(429, "rate_limited", "Too many reports from here. Please try again later.");
    }
  } catch (e) {
    logError("report rate limit", e);
  }

  try {
    await store.save({ fullName, headSha, verdict, score, engineVersion, reason, clientKey: key }, new Date(now));
  } catch (e) {
    logError("save false report", e);
    return fail(503, "storage_unavailable", "Could not save your report. Please try again later.");
  }
  return Response.json({ ok: true }, { headers });
}
