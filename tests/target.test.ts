import { describe, expect, it } from "vitest";

import { InvalidTarget } from "../src/engine/errors";
import { parseTarget } from "../src/engine/target";

describe("parseTarget", () => {
  it.each([
    ["octo/demo", "octo", "demo"],
    ["  octo/demo  ", "octo", "demo"],
    ["github.com/octo/demo", "octo", "demo"],
    ["www.github.com/octo/demo", "octo", "demo"],
    ["https://github.com/octo/demo", "octo", "demo"],
    ["https://github.com/octo/demo.git", "octo", "demo"],
    ["https://github.com/octo/demo/", "octo", "demo"],
    ["https://github.com/octo/demo/tree/main/src", "octo", "demo"],
    ["https://github.com/octo/demo?tab=readme#top", "octo", "demo"],
    ["http://github.com/Octo-Cat/my.repo_name-1", "Octo-Cat", "my.repo_name-1"],
  ])("accepts %s", (raw, owner, repo) => {
    expect(parseTarget(raw)).toEqual({ owner, repo });
  });

  it.each([
    "",
    "octo",
    "octo/demo/extra",
    "-octo/demo",
    "octo/..",
    "octo/.",
    "octo/de mo",
    "https://gitlab.com/octo/demo",
    "https://github.com.evil.example/octo/demo",
    "https://user:pass@github.com/octo/demo",
    "https://github.com:8443/octo/demo",
    "javascript:alert(1)//github.com/octo/demo",
    "ftp://github.com/octo/demo",
    "https://github.com/octo",
    `${"a".repeat(40)}/demo`,
    `octo/${"r".repeat(101)}`,
  ])("rejects %s", (raw) => {
    expect(() => parseTarget(raw)).toThrow(InvalidTarget);
  });

  it("does not echo unbounded input in the error", () => {
    expect(() => parseTarget(`x${"y".repeat(500)}`)).toThrow(/^Not a GitHub repository: ".{1,100}"$/);
  });
});
