import { describe, expect, it } from "vitest";

import { DependencyIndex, isManifest, normalizePyPI, parseManifest } from "../src/engine/deps";

const names = (path: string, content: string) =>
  parseManifest(path, content).map((d) => [d.name, d.version, d.line]);

describe("isManifest", () => {
  it("picks manifests and lockfiles, not vendored or archived ones", () => {
    for (const p of ["package.json", "web/package-lock.json", "yarn.lock", "pnpm-lock.yaml", "requirements.txt", "requirements-dev.txt", "requirements/base.txt", "pyproject.toml", "poetry.lock", "uv.lock", "Pipfile.lock"]) {
      expect(isManifest(p), p).toBe(true);
    }
    for (const p of ["node_modules/x/package.json", "release.zip!/package.json", "notes.txt", "package.json.bak"]) {
      expect(isManifest(p), p).toBe(false);
    }
  });
});

describe("parseManifest", () => {
  it("reads package.json sections, aliases and exact versions, skipping local and git sources", () => {
    const pkg = `{
  "name": "demo",
  "dependencies": { "left-pad": "^1.3.0", "exact": "2.0.1", "alias": "npm:@scope/real@1.0.0" },
  "devDependencies": { "local": "file:../local", "gh": "user/repo", "git": "git+https://example.invalid/r.git" }
}`;
    expect(names("package.json", pkg)).toEqual([
      ["left-pad", null, 3],
      ["exact", "2.0.1", 3],
      ["@scope/real", "1.0.0", 3],
    ]);
  });

  it("reads npm lockfiles v3 (nested and scoped) and v1", () => {
    const v3 = `{
  "lockfileVersion": 3,
  "packages": {
    "": { "name": "demo" },
    "node_modules/a": { "version": "1.0.0" },
    "node_modules/a/node_modules/@s/b": { "version": "2.0.0" },
    "node_modules/linked": { "link": true }
  }
}`;
    expect(names("package-lock.json", v3)).toEqual([
      ["a", "1.0.0", 5],
      ["@s/b", "2.0.0", 6],
    ]);
    const v1 = `{"dependencies": {"x": {"version": "1.2.3", "dependencies": {"y": {"version": "0.1.0"}}}}}`;
    expect(parseManifest("package-lock.json", v1).map((d) => [d.name, d.version])).toEqual([
      ["x", "1.2.3"],
      ["y", "0.1.0"],
    ]);
    expect(parseManifest("package-lock.json", '{"packages": {"node_modules/cut"')).toEqual([]);
  });

  it("reads yarn v1 and berry lockfiles", () => {
    const v1 = `# yarn lockfile v1

"@babel/core@^7.0.0", "@babel/core@^7.1.0":
  version "7.24.0"
  resolved "https://registry.yarnpkg.com/x"

lodash@^4.17.21:
  version "4.17.21"
`;
    expect(names("yarn.lock", v1)).toEqual([
      ["@babel/core", "7.24.0", 3],
      ["lodash", "4.17.21", 7],
    ]);
    const berry = `__metadata:
  version: 8

"lodash@npm:^4.17.21":
  version: 4.17.21
  resolution: "lodash@npm:4.17.21"
`;
    expect(names("yarn.lock", berry)).toEqual([["lodash", "4.17.21", 4]]);
  });

  it("reads pnpm lockfiles (v6 and v9 keys) from the packages section only", () => {
    const pnpm = `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      chalk:
        specifier: ^5.0.0
packages:
  chalk@5.3.0:
    resolution: {integrity: sha512-x}
  '@types/node@20.11.0':
    resolution: {integrity: sha512-y}
  /old-style@1.0.0(react@18.2.0):
    resolution: {integrity: sha512-z}
snapshots:
  chalk@5.3.0: {}
`;
    expect(names("pnpm-lock.yaml", pnpm)).toEqual([
      ["chalk", "5.3.0", 8],
      ["@types/node", "20.11.0", 10],
      ["old-style", "1.0.0", 12],
    ]);
  });

  it("reads requirements files", () => {
    const req = `# comment
Django==4.2.1
requests>=2.0  # inline
Flask_Login
-r other.txt
--hash=sha256:abc
git+https://example.invalid/pkg.git
./local
pkg @ https://example.invalid/pkg.whl
numpy==1.26.*
`;
    expect(names("requirements.txt", req)).toEqual([
      ["django", "4.2.1", 2],
      ["requests", null, 3],
      ["flask-login", null, 4],
      ["numpy", null, 10],
    ]);
  });

  it("reads PEP 621 and Poetry sections of pyproject.toml", () => {
    const toml = `[project]
name = "demo"
dependencies = [
  "httpx>=0.27",
  "pydantic==2.7.0",
]

[project.optional-dependencies]
dev = ["pytest"]

[tool.poetry.dependencies]
python = "^3.11"
rich = "13.7.1"
typer = { version = "^0.12" }
`;
    expect(names("pyproject.toml", toml)).toEqual([
      ["httpx", null, 4],
      ["pydantic", "2.7.0", 5],
      ["pytest", null, 9],
      ["rich", "13.7.1", 13],
      ["typer", null, 14],
    ]);
  });

  it("reads poetry.lock/uv.lock and Pipfile.lock", () => {
    const lock = `[[package]]
name = "Some_Package"
version = "1.0.0"

[[package]]
name = "other"
version = "2.0.0"
`;
    expect(names("uv.lock", lock)).toEqual([
      ["some-package", "1.0.0", 2],
      ["other", "2.0.0", 6],
    ]);
    const pipfile = `{"default": {"requests": {"version": "==2.31.0"}}, "develop": {"pytest": {"version": "*"}}}`;
    expect(parseManifest("Pipfile.lock", pipfile).map((d) => [d.name, d.version])).toEqual([
      ["requests", "2.31.0"],
      ["pytest", null],
    ]);
  });
});

describe("DependencyIndex", () => {
  it("queries exact versions when known and the name alone otherwise", () => {
    const index = new DependencyIndex();
    index.add(parseManifest("package.json", '{"dependencies": {"a": "^1.0.0", "b": "^2.0.0"}}'));
    index.add(parseManifest("package-lock.json", '{"packages": {"node_modules/a": {"version": "1.4.0"}}}'));
    expect(index.queries()).toEqual([
      { ecosystem: "npm", name: "a", version: "1.4.0" },
      { ecosystem: "npm", name: "b" },
    ]);
    expect(index.size).toBe(2);
  });

  it("normalises Python names", () => {
    expect(normalizePyPI("Django_Rest.Framework")).toBe("django-rest-framework");
  });
});
