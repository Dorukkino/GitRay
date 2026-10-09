import { afterEach, describe, expect, it, vi } from "vitest";

import { logError, redact } from "../src/lib/log";

describe("log redaction", () => {
  afterEach(() => vi.restoreAllMocks());

  it("hides connection strings and GitHub tokens", () => {
    expect(redact("bad url postgresql://user:s3cret@ep-x.neon.tech/db?sslmode=require")).toBe(
      "bad url [redacted connection string]",
    );
    expect(redact("token github_pat_11ABCDEFGHIJKLMNOPQRSTUV_xyz rejected")).toBe("token [redacted token] rejected");
    expect(redact("plain message")).toBe("plain message");
  });

  it("hides the configured VirusTotal key", () => {
    vi.stubEnv("VIRUSTOTAL_API_KEY", "f".repeat(64));
    expect(redact(`request with ${"f".repeat(64)} failed`)).toBe("request with [redacted key] failed");
    vi.unstubAllEnvs();
  });

  it("logs the error class and code, never the secret", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logError("db", Object.assign(new Error("connect postgres://a:pw@h/db failed"), { code: "XX000" }));
    const line = String(spy.mock.calls[0][0]);
    expect(line).toContain("db: Error XX000");
    expect(line).not.toContain("pw");
  });
});
