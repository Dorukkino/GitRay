/**
 * Password hashing and stateless session tokens for the admin panel.
 * Passwords: scrypt with a per-account random salt, compared in constant time.
 * Sessions: an HMAC-signed, expiring token in an httpOnly cookie (no session
 * table). Everything is keyed by ADMIN_SECRET (src/lib/secret.ts); with no
 * secret the admin panel is disabled.
 */

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { signingSecret } from "./secret";

export const ADMIN_COOKIE = "gitray-adm";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SCRYPT_KEYLEN = 64;

export interface PasswordHash {
  hash: string;
  salt: string;
}

export function hashPassword(password: string): PasswordHash {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  let expected: Buffer;
  try {
    expected = Buffer.from(hash, "hex");
    if (expected.length !== SCRYPT_KEYLEN) return false;
  } catch {
    return false;
  }
  const actual = scryptSync(password, salt, SCRYPT_KEYLEN);
  return timingSafeEqual(actual, expected);
}

function sign(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** A signed session token, or null when no signing secret is configured. */
export function signSession(now = Date.now()): string | null {
  const secret = signingSecret();
  if (!secret) return null;
  const exp = now + SESSION_TTL_MS;
  const nonce = randomBytes(9).toString("base64url");
  return `${exp}.${nonce}.${sign(secret, `${exp}.${nonce}`)}`;
}

/** True when the cookie holds a valid, unexpired session this server signed. */
export function verifySession(token: string | undefined, now = Date.now()): boolean {
  const secret = signingSecret();
  if (!secret || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expStr, nonce, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < now) return false;
  return safeEqual(sign(secret, `${expStr}.${nonce}`), sig);
}

export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;

/** Usernames: 3-32 chars, letters/digits and . _ - (so they are safe to display). */
export function validUsername(username: unknown): username is string {
  return typeof username === "string" && /^[A-Za-z0-9._-]{3,32}$/.test(username);
}

/** Passwords: at least 10 characters, at most 200. */
export function validPassword(password: unknown): password is string {
  return typeof password === "string" && password.length >= 10 && password.length <= 200;
}
