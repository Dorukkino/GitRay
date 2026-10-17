import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CAPTCHA_LENGTH, newChallenge, verifyCaptcha } from "../src/lib/captcha";

const SAVED = { admin: process.env.ADMIN_SECRET, db: process.env.DATABASE_URL, pg: process.env.POSTGRES_URL };

describe("captcha", () => {
  beforeEach(() => {
    process.env.ADMIN_SECRET = "captcha-test-secret";
  });
  afterEach(() => {
    process.env.ADMIN_SECRET = SAVED.admin;
    process.env.DATABASE_URL = SAVED.db;
    process.env.POSTGRES_URL = SAVED.pg;
  });

  it("verifies the right answer for its purpose (case-insensitive)", () => {
    const c = newChallenge("report", 1000);
    expect(c).not.toBeNull();
    expect(c!.answer).toHaveLength(CAPTCHA_LENGTH);
    expect(verifyCaptcha(c!.token, c!.answer, "report", 2000)).toBe(true);
    expect(verifyCaptcha(c!.token, c!.answer.toLowerCase(), "report", 2000)).toBe(true);
  });

  it("rejects a wrong answer, a different purpose, and an expired token", () => {
    const c = newChallenge("report", 1000)!;
    expect(verifyCaptcha(c.token, "ZZZZZ", "report", 2000)).toBe(false);
    expect(verifyCaptcha(c.token, c.answer, "login", 2000)).toBe(false);
    expect(verifyCaptcha(c.token, c.answer, "report", 1000 + 6 * 60 * 1000)).toBe(false);
    expect(verifyCaptcha("not.a.valid.token", c.answer, "report", 2000)).toBe(false);
  });

  it("never puts the answer in the token", () => {
    const c = newChallenge("login", 1000)!;
    expect(c.token.toUpperCase()).not.toContain(c.answer);
  });

  it("is disabled when no secret is configured", () => {
    delete process.env.ADMIN_SECRET;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    expect(newChallenge("report")).toBeNull();
    expect(verifyCaptcha("a.b.c.d", "ABCDE", "report")).toBe(false);
  });
});
