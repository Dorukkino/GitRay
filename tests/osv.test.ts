import { describe, expect, it } from "vitest";

import { GitHubClient } from "../src/engine/github";
import { OsvClient, type OsvVuln, affectsAllVersions } from "../src/engine/osv";
import { scanRepo } from "../src/engine/scanner";
import { FakeGitHub, makeTarball } from "./helpers";

const ALL_VERSIONS: OsvVuln = {
  id: "MAL-2026-0001",
  affected: [{ package: { name: "evil-pkg", ecosystem: "npm" }, ranges: [{ type: "SEMVER", events: [{ introduced: "0" }] }] }],
};
const SOME_VERSIONS: OsvVuln = {
  id: "MAL-2026-0002",
  affected: [{ package: { name: "popular", ecosystem: "npm" }, versions: ["5.6.1"] }],
};

/** Imitates the two OSV endpoints GiTRay uses. */
class FakeOsv {
  /** "ecosystem:name" or "ecosystem:name@version" -> record IDs. */
  matches = new Map<string, string[]>();
  vulns = new Map<string, OsvVuln>([ALL_VERSIONS, SOME_VERSIONS].map((v) => [v.id, v]));
  batches: unknown[] = [];
  down = false;

  fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (this.down) throw new TypeError("fetch failed");
    const url = new URL(String(input));
    if (url.pathname === "/v1/querybatch") {
      const body = JSON.parse(String(init?.body)) as { queries: { package: { name: string; ecosystem: string }; version?: string }[] };
      this.batches.push(body);
      return Response.json({
        results: body.queries.map((q) => {
          const ids = this.matches.get(`${q.package.ecosystem}:${q.package.name}${q.version ? `@${q.version}` : ""}`) ?? [];
          return ids.length ? { vulns: ids.map((id) => ({ id, modified: "2026-01-01T00:00:00Z" })) } : {};
        }),
      });
    }
    const id = decodeURIComponent(url.pathname.replace("/v1/vulns/", ""));
    const v = this.vulns.get(id);
    return v ? Response.json(v) : Response.json({ code: 5 }, { status: 404 });
  }) as typeof fetch;

  client() {
    return new OsvClient({ fetch: this.fetch, apiUrl: "https://osv.test" });
  }
}

describe("affectsAllVersions", () => {
  it("tells typosquats from hijacked releases", () => {
    expect(affectsAllVersions(ALL_VERSIONS, "evil-pkg", "npm")).toBe(true);
    expect(affectsAllVersions(ALL_VERSIONS, "evil-pkg", "PyPI")).toBe(false);
    expect(affectsAllVersions(SOME_VERSIONS, "popular", "npm")).toBe(false);
  });
});

describe("dependency check during a scan", () => {
  async function scan(files: Record<string, string>, osv: FakeOsv) {
    const gh = new FakeGitHub();
    gh.tarball = makeTarball(files);
    return scanRepo({ owner: "octo", repo: "demo" }, new GitHubClient({ fetch: gh.fetch }), { osv: osv.client() });
  }

  const lock = `{
  "lockfileVersion": 3,
  "packages": {
    "": { "name": "demo" },
    "node_modules/popular": { "version": "5.6.1" },
    "node_modules/fine": { "version": "1.0.0" }
  }
}`;

  it("flags an installed malicious version from the lockfile as dangerous", async () => {
    const osv = new FakeOsv();
    osv.matches.set("npm:popular@5.6.1", ["MAL-2026-0002", "GHSA-xxxx-yyyy-zzzz"]);
    const result = await scan({ "package.json": '{"dependencies": {"popular": "^5.0.0"}}', "package-lock.json": lock }, osv);
    expect(result.dependencyCheck).toEqual({ status: "found", packages: 2, malicious: 1 });
    const f = result.findings.find((x) => x.ruleId === "GR-DEP-001");
    expect(f).toMatchObject({ path: "package-lock.json", line: 5, weight: 70 });
    expect(f?.note).toContain("popular 5.6.1 is a known malicious npm package (MAL-2026-0002)");
    expect(result.verdict).toBe("dangerous");
  });

  it("flags a package declared by range only when every version is malicious", async () => {
    const osv = new FakeOsv();
    osv.matches.set("npm:evil-pkg", [ALL_VERSIONS.id]);
    osv.matches.set("npm:popular", [SOME_VERSIONS.id]);
    const result = await scan({ "package.json": '{\n  "dependencies": {\n    "popular": "^5.0.0",\n    "evil-pkg": "^1.0.0"\n  }\n}' }, osv);
    const flagged = result.findings.filter((x) => x.ruleId === "GR-DEP-001");
    expect(flagged.map((f) => [f.path, f.line])).toEqual([["package.json", 4]]);
    expect(flagged[0].note).toContain("every version of evil-pkg");
  });

  it("checks Python requirements and ignores non-malware advisories", async () => {
    const osv = new FakeOsv();
    osv.matches.set("PyPI:requests@2.0.0", ["PYSEC-2023-74"]);
    const result = await scan({ "requirements.txt": "requests==2.0.0\n" }, osv);
    expect(result.dependencyCheck).toEqual({ status: "ok", packages: 1, malicious: 0 });
    expect(result.findings).toEqual([]);
    expect(JSON.stringify(osv.batches)).toContain('"ecosystem":"PyPI"');
  });

  it("never fails the scan when OSV is down, and reports when nothing was declared", async () => {
    const down = new FakeOsv();
    down.down = true;
    const result = await scan({ "package.json": '{"dependencies": {"a": "1.0.0"}}' }, down);
    expect(result).toMatchObject({ verdict: "clean", dependencyCheck: { status: "unavailable", packages: 1 } });
    expect((await scan({ "README.md": "# hi\n" }, new FakeOsv())).dependencyCheck.status).toBe("none");
  });

  it("does not read manifests inside ZIP files or node_modules", async () => {
    const osv = new FakeOsv();
    osv.matches.set("npm:evil-pkg", [ALL_VERSIONS.id]);
    const result = await scan({ "node_modules/x/package.json": '{"dependencies": {"evil-pkg": "1.0.0"}}' }, osv);
    expect(result.dependencyCheck.status).toBe("none");
  });
});
