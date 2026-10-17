import { describe, expect, it } from "vitest";

import { MAX_REASON, sanitizeReason } from "../src/lib/sanitize-text";

describe("sanitizeReason", () => {
  it("keeps normal text, trims and collapses runs of spaces", () => {
    expect(sanitizeReason("  this   is   wrong  ")).toBe("this is wrong");
  });

  it("drops control, bidi and zero-width characters", () => {
    const bidi = String.fromCodePoint(0x202e);
    const zeroWidth = String.fromCodePoint(0x200b);
    const nul = String.fromCodePoint(0x00);
    expect(sanitizeReason(`ab${bidi}cd${zeroWidth}e${nul}f`)).toBe("abcdef");
  });

  it("keeps newlines but limits long blank runs", () => {
    expect(sanitizeReason("a\n\n\n\nb")).toBe("a\n\nb");
  });

  it("rejects too-short input and non-strings", () => {
    expect(sanitizeReason("a")).toBeNull();
    expect(sanitizeReason("   ")).toBeNull();
    expect(sanitizeReason(123)).toBeNull();
    expect(sanitizeReason(null)).toBeNull();
    expect(sanitizeReason(undefined)).toBeNull();
  });

  it("caps the length", () => {
    expect(sanitizeReason("x".repeat(5000))?.length).toBe(MAX_REASON);
  });
});
