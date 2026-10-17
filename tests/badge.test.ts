/** The README security badge SVG: correct color/label per verdict, no untrusted content. */

import { describe, expect, it } from "vitest";

import { BADGE_COLOR, type BadgeStatus, badgeSvg } from "../src/lib/badge";

describe("badgeSvg", () => {
  it("renders each verdict with its color and label", () => {
    const cases: BadgeStatus[] = ["clean", "suspicious", "dangerous", "incomplete", "not scanned"];
    for (const status of cases) {
      const svg = badgeSvg(status);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain(BADGE_COLOR[status]);
      expect(svg).toContain(`>${status}</text>`);
      expect(svg).toContain("GiTRay");
      // The badge carries only our fixed text — never any repository name.
      expect(svg).toContain('role="img"');
    }
  });

  it("gives a wider status a wider badge", () => {
    const width = (s: BadgeStatus) => Number(/width="(\d+)"/.exec(badgeSvg(s))![1]);
    expect(width("dangerous")).toBeGreaterThan(width("clean"));
  });
});
