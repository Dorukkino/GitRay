/**
 * A self-made robot check. The server picks a short random code, signs it, and
 * draws it into a PNG (see src/app/api/captcha/route.ts). Only the signed token
 * (an HMAC of the code, never the code itself) is sent to the browser, in an
 * httpOnly cookie; the code appears only in the image's pixels. So the answer is
 * nowhere in the page source, the response body, JavaScript, or DevTools.
 *
 * Stateless: the token carries its own purpose, nonce and expiry and is checked
 * by re-signing the visitor's guess and comparing. Short expiry plus IP rate
 * limits stand in for strict single-use (no per-load database write).
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { signingSecret } from "./secret";

export const CAPTCHA_COOKIE = "gitray-cap";
export const CAPTCHA_LENGTH = 5;
const TTL_MS = 5 * 60 * 1000;
// No 0/O/1/I/L: hard to tell apart in a distorted image.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export type CaptchaPurpose = "report" | "login";

function sign(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** A random code in the captcha alphabet (uppercase; matching is case-insensitive). */
export function randomAnswer(): string {
  const bytes = randomBytes(CAPTCHA_LENGTH);
  let out = "";
  for (let i = 0; i < CAPTCHA_LENGTH; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export interface Challenge {
  answer: string;
  token: string;
}

/** A fresh challenge, or null when no signing secret is configured (feature off). */
export function newChallenge(purpose: CaptchaPurpose, now = Date.now()): Challenge | null {
  const secret = signingSecret();
  if (!secret) return null;
  const answer = randomAnswer();
  const nonce = randomBytes(9).toString("base64url");
  const exp = now + TTL_MS;
  const sig = sign(secret, `${answer}|${purpose}|${nonce}|${exp}`);
  return { answer, token: `${purpose}.${nonce}.${exp}.${sig}` };
}

/** True when `submitted` is the code the token was signed for, the token is for `purpose`, and it has not expired. */
export function verifyCaptcha(
  token: string | undefined,
  submitted: string | undefined,
  purpose: CaptchaPurpose,
  now = Date.now(),
): boolean {
  const secret = signingSecret();
  if (!secret || !token || !submitted) return false;
  const parts = token.split(".");
  if (parts.length !== 4) return false;
  const [p, nonce, expStr, sig] = parts;
  const exp = Number(expStr);
  if (p !== purpose || !Number.isFinite(exp) || exp < now) return false;
  const guess = submitted.trim().toUpperCase();
  if (guess.length !== CAPTCHA_LENGTH) return false;
  return safeEqual(sign(secret, `${guess}|${purpose}|${nonce}|${exp}`), sig);
}
