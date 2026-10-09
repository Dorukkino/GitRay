import { describe, expect, it } from "vitest";

import { GitHubClient } from "../src/engine/github";
import { toReport } from "../src/engine/report";
import { scanRepo } from "../src/engine/scanner";
import { MAX_SUBMODULES, parseGitmodules } from "../src/engine/submodules";
import { FakeGitHub, makeTarball } from "./helpers";

describe("parseGitmodules", () => {
  it("reads path and url and recognizes GitHub repositories in every URL form", () => {
    const text = [
      '[submodule "lib/a"]',
      "\tpath = lib/a",
      "\turl = https://github.com/octo/a.git",
      '[submodule "b"]',
      "  path = vendor/b",
      "  url = git@github.com:other-org/b",
      '[submodule "c"]',
      '  url = "ssh://git@github.com/octo/c.git"',
      '[submodule "d"]',
      "  path = d",
      "  url = ../sibling.git",
      '[submodule "e"]',
      "  path = e",
      "  url = https://gitlab.example.invalid/x/e.git",
      "[core]",
      "  url = https://github.com/ignored/section",
      "# comment",
    ].join("\n");
    expect(parseGitmodules(text, "octo")).toEqual([
      { path: "lib/a", url: "https://github.com/octo/a.git", github: "octo/a" },
      { path: "vendor/b", url: "git@github.com:other-org/b", github: "other-org/b" },
      { path: "c", url: "ssh://git@github.com/octo/c.git", github: "octo/c" },
      { path: "d", url: "../sibling.git", github: "octo/sibling" },
      { path: "e", url: "https://gitlab.example.invalid/x/e.git", github: null },
    ]);
  });

  it("rejects names GitHub would not accept and caps the list", () => {
    const bad = '[submodule "x"]\n  path = x\n  url = https://github.com/-bad-/x\n';
    expect(parseGitmodules(bad, null)[0].github).toBeNull();
    const many = Array.from({ length: MAX_SUBMODULES + 10 }, (_, i) => `[submodule "m${i}"]\n url = https://github.com/o/m${i}\n`).join("");
    expect(parseGitmodules(many, null)).toHaveLength(MAX_SUBMODULES);
  });
});

describe("submodules in a scan", () => {
  it("lists the top-level .gitmodules only, and sanitizes it in the report", async () => {
    const gh = new FakeGitHub();
    gh.tarball = makeTarball({
      ".gitmodules": '[submodule "evil"]\n  path = tools/evil\n  url = https://evil.example.invalid/payload.git\n[submodule "ok"]\n  path = ok\n  url = https://github.com/octo/ok\n',
      "vendor/x/.gitmodules": '[submodule "nested"]\n  url = https://github.com/octo/nested\n',
      "README.md": "# demo\n",
    });
    const result = await scanRepo({ owner: "octo", repo: "demo" }, new GitHubClient({ fetch: gh.fetch }));
    expect(result.submodules.map((s) => s.path)).toEqual(["tools/evil", "ok"]);
    const report = toReport(result);
    expect(report.submodules[0]).toEqual({ path: "tools/evil", url: "hxxps://evil[.]example[.]invalid/payload.git", github: null });
    expect(report.submodules[1].github).toBe("octo/ok");
  });
});
