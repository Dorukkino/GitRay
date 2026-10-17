import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { hashPassword, signSession, validPassword, validUsername, verifyPassword, verifySession } from "../src/lib/admin-auth";

const SAVED = process.env.ADMIN_SECRET;

describe("admin auth", () => {
  beforeEach(() => {
    process.env.ADMIN_SECRET = "session-test-secret";
  });
  afterEach(() => {
    process.env.ADMIN_SECRET = SAVED;
  });

  it("hashes a password and verifies it in constant time", () => {
    const { hash, salt } = hashPassword("correct horse battery staple");
    expect(hash).toMatch(/^[0-9a-f]{128}$/);
    expect(hash).not.toContain("correct");
    expect(verifyPassword("correct horse battery staple", salt, hash)).toBe(true);
    expect(verifyPassword("wrong password here", salt, hash)).toBe(false);
  });

  it("signs a session and rejects tampering, expiry and a missing token", () => {
    const token = signSession(1000);
    expect(token).not.toBeNull();
    expect(verifySession(token!, 2000)).toBe(true);
    expect(verifySession(`${token}x`, 2000)).toBe(false);
    expect(verifySession(token!, 1000 + 8 * 24 * 60 * 60 * 1000)).toBe(false);
    expect(verifySession(undefined, 2000)).toBe(false);
  });

  it("is disabled without a secret", () => {
    delete process.env.ADMIN_SECRET;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    expect(signSession()).toBeNull();
    expect(verifySession("1.2.3", 0)).toBe(false);
  });

  it("validates usernames and passwords", () => {
    expect(validUsername("doruk_adm")).toBe(true);
    expect(validUsername("ab")).toBe(false);
    expect(validUsername("has space")).toBe(false);
    expect(validUsername(42)).toBe(false);
    expect(validPassword("0123456789")).toBe(true);
    expect(validPassword("short")).toBe(false);
    expect(validPassword(42)).toBe(false);
  });
});
