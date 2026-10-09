/**
 * Read the dependencies a repository declares, from manifests and lockfiles.
 * Only parses text; nothing is installed or resolved. Lockfiles give exact
 * versions (transitive dependencies included); manifests often only ranges.
 */

import { basename, splitLines } from "./text";
import { ARCHIVE_SEPARATOR } from "./zip";

export type Ecosystem = "npm" | "PyPI";

export interface DeclaredDependency {
  ecosystem: Ecosystem;
  name: string;
  /** Exact version when the file pins one (lockfiles, "==1.2.3"); null for ranges. */
  version: string | null;
  path: string;
  line: number;
  text: string;
}

const NPM_LOCKFILES = new Set(["package-lock.json", "npm-shrinkwrap.json"]);
const MANIFESTS = new Set([
  "package.json",
  ...NPM_LOCKFILES,
  "yarn.lock",
  "pnpm-lock.yaml",
  "pyproject.toml",
  "poetry.lock",
  "uv.lock",
  "pipfile.lock",
]);
const EXACT_SEMVER = /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const PEP508 = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*(.*)$/;

const LOCKFILES = new Set([...NPM_LOCKFILES, "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "uv.lock", "pipfile.lock"]);

/** Lockfiles of big projects exceed the per-file limit; they are read whole (see archive.ts). */
export function isLockfile(path: string): boolean {
  return LOCKFILES.has(basename(path).toLowerCase());
}

/** A file worth parsing: not vendored and not inside a ZIP (those are never installed). */
export function isManifest(path: string): boolean {
  if (path.includes(ARCHIVE_SEPARATOR) || /(?:^|\/)node_modules\//.test(path)) return false;
  const name = basename(path).toLowerCase();
  return MANIFESTS.has(name) || /^requirements[\w.-]*\.txt$/.test(name) || /(?:^|\/)requirements\/[^/]+\.txt$/i.test(path);
}

/** PEP 503 normalisation: "Django_Rest.Framework" and "django-rest-framework" are one package. */
export function normalizePyPI(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

function lineOf(lines: string[], needle: string, from = 0): number {
  for (let i = from; i < lines.length; i++) if (lines[i].includes(needle)) return i;
  return -1;
}

function dep(ecosystem: Ecosystem, name: string, version: string | null, path: string, lines: string[], index: number): DeclaredDependency {
  const i = Math.max(0, index);
  return { ecosystem, name, version, path, line: i + 1, text: lines[i] ?? "" };
}

function parsePackageJson(path: string, content: string, lines: string[]): DeclaredDependency[] {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return [];
  }
  if (typeof data !== "object" || data === null) return [];
  const out: DeclaredDependency[] = [];
  for (const section of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    const deps = (data as Record<string, unknown>)[section];
    if (typeof deps !== "object" || deps === null) continue;
    for (const [declared, rawSpec] of Object.entries(deps)) {
      if (typeof rawSpec !== "string") continue;
      let name = declared;
      let spec = rawSpec.trim();
      // "alias": "npm:real-package@^1.0.0" installs real-package.
      const alias = /^npm:((?:@[^/@]+\/)?[^@]+)(?:@(.*))?$/.exec(spec);
      if (alias) {
        name = alias[1];
        spec = alias[2] ?? "";
      } else if (/^(?:file:|link:|workspace:|portal:|patch:|git|github:|gitlab:|bitbucket:|https?:)|^[\w.-]+\/[\w.-]+(?:#.*)?$/.test(spec)) {
        continue; // local paths and git/URL sources are not registry packages
      }
      const version = EXACT_SEMVER.test(spec) ? spec.replace(/^v/, "") : null;
      out.push(dep("npm", name, version, path, lines, lineOf(lines, `"${declared}"`)));
    }
  }
  return out;
}

function parseNpmLock(path: string, content: string, lines: string[]): DeclaredDependency[] {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return []; // e.g. cut off at the per-file limit
  }
  if (typeof data !== "object" || data === null) return [];
  const out: DeclaredDependency[] = [];
  const keyLines = new Map<string, number>();
  lines.forEach((l, i) => {
    const m = /^\s*"(node_modules\/[^"]+)":\s*\{/.exec(l);
    if (m && !keyLines.has(m[1])) keyLines.set(m[1], i);
  });
  const packages = (data as { packages?: Record<string, { version?: unknown; link?: unknown }> }).packages;
  if (packages && typeof packages === "object") {
    for (const [key, value] of Object.entries(packages)) {
      const at = key.lastIndexOf("node_modules/");
      if (at === -1 || !value || value.link || typeof value.version !== "string") continue;
      const name = key.slice(at + "node_modules/".length);
      out.push(dep("npm", name, value.version, path, lines, keyLines.get(key) ?? lineOf(lines, `"${key}"`)));
    }
    return out;
  }
  // lockfileVersion 1: nested "dependencies".
  const walk = (deps: unknown) => {
    if (typeof deps !== "object" || deps === null) return;
    for (const [name, value] of Object.entries(deps as Record<string, { version?: unknown; dependencies?: unknown }>)) {
      if (value && typeof value.version === "string" && EXACT_SEMVER.test(value.version)) {
        out.push(dep("npm", name, value.version, path, lines, lineOf(lines, `"${name}": {`)));
      }
      walk(value?.dependencies);
    }
  };
  walk((data as { dependencies?: unknown }).dependencies);
  return out;
}

function parseYarnLock(path: string, lines: string[]): DeclaredDependency[] {
  const out: DeclaredDependency[] = [];
  let current: { name: string; line: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.startsWith(" ") && l.endsWith(":") && !l.startsWith("#") && !l.startsWith("__metadata")) {
      const first = l.slice(0, -1).split(",")[0].trim().replace(/^"|"$/g, "");
      const at = first.indexOf("@", first.startsWith("@") ? 1 : 0);
      current = at > 0 ? { name: first.slice(0, at), line: i } : null;
      continue;
    }
    const v = current && /^\s+version:?\s+"?([^"\s]+)"?\s*$/.exec(l);
    if (current && v) {
      out.push(dep("npm", current.name, v[1], path, lines, current.line));
      current = null;
    }
  }
  return out;
}

function parsePnpmLock(path: string, lines: string[]): DeclaredDependency[] {
  const out: DeclaredDependency[] = [];
  let inPackages = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\S/.test(l)) {
      inPackages = /^packages:\s*$/.test(l);
      continue;
    }
    if (!inPackages) continue;
    // v5 "/name/1.2.3:", v6 "/name@1.2.3:", v9 "name@1.2.3:" (scoped names quoted), peers in "(...)".
    const m = /^ {2}['"]?\/?((?:@[^/@\s'"]+\/)?[^/@\s'"(]+)[@/](\d[^\s'"():]*)/.exec(l);
    if (m) out.push(dep("npm", m[1], m[2], path, lines, i));
  }
  return out;
}

function requirement(spec: string): { name: string; version: string | null } | null {
  const m = PEP508.exec(spec);
  if (!m || /^\s*@/.test(m[2])) return null; // "name @ https://..." direct references
  const exact = /^==\s*([A-Za-z0-9.+!]+)\s*(?:;.*)?$/.exec(m[2].trim());
  return { name: normalizePyPI(m[1]), version: exact ? exact[1] : null };
}

function parseRequirements(path: string, lines: string[]): DeclaredDependency[] {
  const out: DeclaredDependency[] = [];
  lines.forEach((raw, i) => {
    const l = raw.replace(/\s+#.*$/, "").trim();
    if (!l || l.startsWith("#") || l.startsWith("-") || /^[a-z+]+:\/\//i.test(l) || /^[./]/.test(l)) return;
    const r = requirement(l);
    if (r) out.push(dep("PyPI", r.name, r.version, path, lines, i));
  });
  return out;
}

function parsePyproject(path: string, lines: string[]): DeclaredDependency[] {
  const out: DeclaredDependency[] = [];
  let section = "";
  let inArray = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].replace(/\s+#.*$/, "");
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(l);
    if (header) {
      section = header[1].trim();
      inArray = false;
      continue;
    }
    const pep621 = section === "project" || section === "project.optional-dependencies" || section === "dependency-groups";
    const poetry = /^tool\.poetry(?:\.group\.[^.]+)?\.(?:dev-)?dependencies$/.test(section);
    if (pep621) {
      if (/^\s*[\w.-]+\s*=\s*\[/.test(l) && (section !== "project" || /^\s*dependencies\s*=/.test(l))) inArray = true;
      if (inArray) {
        for (const s of l.matchAll(/"([^"]+)"|'([^']+)'/g)) {
          const r = requirement(s[1] ?? s[2]);
          if (r) out.push(dep("PyPI", r.name, r.version, path, lines, i));
        }
        if (l.includes("]")) inArray = false;
      }
    } else if (poetry) {
      const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*=\s*(.*)$/.exec(l);
      if (m && m[1].toLowerCase() !== "python") {
        const exact = /^"(\d[^"^~<>=*,]*)"$/.exec(m[2].trim());
        out.push(dep("PyPI", normalizePyPI(m[1]), exact ? exact[1] : null, path, lines, i));
      }
    }
  }
  return out;
}

/** poetry.lock and uv.lock: [[package]] blocks with name and version. */
function parseTomlLock(path: string, lines: string[]): DeclaredDependency[] {
  const out: DeclaredDependency[] = [];
  let name: { value: string; line: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\[\[package\]\]/.test(l)) name = null;
    const n = /^name\s*=\s*"([^"]+)"/.exec(l);
    if (n) name = { value: n[1], line: i };
    const v = /^version\s*=\s*"([^"]+)"/.exec(l);
    if (v && name) {
      out.push(dep("PyPI", normalizePyPI(name.value), v[1], path, lines, name.line));
      name = null;
    }
  }
  return out;
}

function parsePipfileLock(path: string, content: string, lines: string[]): DeclaredDependency[] {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return [];
  }
  const out: DeclaredDependency[] = [];
  for (const section of ["default", "develop"]) {
    const deps = (data as Record<string, unknown> | null)?.[section];
    if (typeof deps !== "object" || deps === null) continue;
    for (const [name, value] of Object.entries(deps as Record<string, { version?: unknown }>)) {
      const exact = typeof value?.version === "string" ? /^==(.+)$/.exec(value.version) : null;
      out.push(dep("PyPI", normalizePyPI(name), exact ? exact[1] : null, path, lines, lineOf(lines, `"${name}"`)));
    }
  }
  return out;
}

export function parseManifest(path: string, content: string): DeclaredDependency[] {
  const name = basename(path).toLowerCase();
  const lines = splitLines(content);
  if (name === "package.json") return parsePackageJson(path, content, lines);
  if (NPM_LOCKFILES.has(name)) return parseNpmLock(path, content, lines);
  if (name === "yarn.lock") return parseYarnLock(path, lines);
  if (name === "pnpm-lock.yaml") return parsePnpmLock(path, lines);
  if (name === "pyproject.toml") return parsePyproject(path, lines);
  if (name === "poetry.lock" || name === "uv.lock") return parseTomlLock(path, lines);
  if (name === "pipfile.lock") return parsePipfileLock(path, content, lines);
  return parseRequirements(path, lines);
}

/** Every distinct package of a repository, with where it is declared. */
export class DependencyIndex {
  private readonly packages = new Map<string, { ecosystem: Ecosystem; name: string; versions: Set<string>; sites: DeclaredDependency[] }>();

  add(deps: Iterable<DeclaredDependency>): void {
    for (const d of deps) {
      const key = `${d.ecosystem}:${d.name}`;
      let p = this.packages.get(key);
      if (!p) {
        p = { ecosystem: d.ecosystem, name: d.name, versions: new Set(), sites: [] };
        this.packages.set(key, p);
      }
      if (d.version) p.versions.add(d.version);
      if (p.sites.length < 3) p.sites.push(d);
    }
  }

  get size(): number {
    return this.packages.size;
  }

  /** Where a package is declared, preferring the declaration of a given version. */
  sitesOf(ecosystem: Ecosystem, name: string): DeclaredDependency[] {
    return this.packages.get(`${ecosystem}:${name}`)?.sites ?? [];
  }

  /**
   * One query per exact version; a name-only query for packages declared
   * with ranges only (resolved later against the advisory's affected versions).
   */
  queries(): { ecosystem: Ecosystem; name: string; version?: string }[] {
    const out: { ecosystem: Ecosystem; name: string; version?: string }[] = [];
    for (const p of this.packages.values()) {
      if (p.versions.size === 0) out.push({ ecosystem: p.ecosystem, name: p.name });
      else for (const version of p.versions) out.push({ ecosystem: p.ecosystem, name: p.name, version });
    }
    return out;
  }
}
