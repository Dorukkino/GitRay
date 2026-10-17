/**
 * The secret that signs admin sessions and captcha tokens, and whether cookies
 * must be marked Secure. ADMIN_SECRET is preferred; the database URL is a
 * fallback so the public report captcha still works when only a database is set.
 * Without any secret the admin panel and report feature are disabled.
 */

import { databaseUrl } from "./db";
import { siteUrl } from "./site";

export function signingSecret(): string | null {
  return process.env.ADMIN_SECRET || databaseUrl() || null;
}

/** Secure cookies only over HTTPS (production); never on http://localhost in development or tests. */
export function secureCookies(): boolean {
  return siteUrl().startsWith("https://");
}
