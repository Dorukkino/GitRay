/**
 * False-positive calibration: scan local checkouts of popular, clean repositories
 * with the engine and print a table of verdicts and rules.
 *
 *   git clone --depth 1 https://github.com/<owner>/<repo> <base>/<owner>/<repo>   (lowercase)
 *   npm run calibrate -- <base> [repos.txt]
 *
 * Files are only read, never run. Repository signals (account and repository age,
 * releases) are left out: these checkouts carry no GitHub metadata.
 */

import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { ArchiveEntry } from "../src/engine/archive";
import { isLockfile } from "../src/engine/deps";
import { DEFAULT_LIMITS } from "../src/engine/limits";
import { toReport } from "../src/engine/report";
import { scanEntries } from "../src/engine/scanner";
import { decode } from "../src/engine/text";
import type { RepoInfo } from "../src/engine/types";

function* walk(root: string, dir = ""): Generator<string> {
  for (const name of readdirSync(join(root, dir))) {
    if (name === ".git") continue;
    const path = dir ? `${dir}/${name}` : name;
    const st = lstatSync(join(root, path));
    if (st.isDirectory()) yield* walk(root, path);
    else if (st.isFile()) yield path; // symlinks and special files are skipped, as in the tarball reader
  }
}

function entriesOf(root: string): ArchiveEntry[] {
  const entries: ArchiveEntry[] = [];
  for (const path of walk(root)) {
    const whole = path.toLowerCase().endsWith(".zip") || isLockfile(path);
    const cap = whole ? DEFAULT_LIMITS.maxArchiveBytes : DEFAULT_LIMITS.maxFileBytes;
    const bytes = readFileSync(join(root, path));
    const data = new Uint8Array(bytes.buffer, bytes.byteOffset, Math.min(bytes.length, cap));
    const text = decode(data);
    entries.push(
      text
        ? { kind: "text", file: { path, content: text.text, truncated: bytes.length > data.length } }
        : { kind: "binary", file: { path, head: data, size: bytes.length } },
    );
  }
  return entries;
}

function infoFor(fullName: string): RepoInfo {
  // An old, established repository: only the files decide the verdict.
  return {
    fullName,
    description: null,
    sizeKb: 1,
    createdAt: "2015-01-01T00:00:00Z",
    pushedAt: null,
    defaultBranch: "main",
    headSha: "0".repeat(40),
    stars: 0,
    forks: 0,
    isFork: false,
    archived: false,
    ownerLogin: fullName.split("/")[0],
    ownerType: "Organization",
    ownerCreatedAt: "2010-01-01T00:00:00Z",
    releaseAssets: [],
  };
}

async function main(): Promise<void> {
  const [base, list = join(__dirname, "calibration-repos.txt")] = process.argv.slice(2);
  if (!base) {
    console.error("usage: npm run calibrate -- <checkouts-dir> [repos.txt]");
    process.exit(2);
  }
  const repos = readFileSync(list, "utf8")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#"));
  const counts = { clean: 0, suspicious: 0, dangerous: 0, incomplete: 0 };
  console.log("| Repository | Verdict | Score | Rules |\n| --- | --- | --- | --- |");
  for (const fullName of repos) {
    const root = join(base, fullName.toLowerCase());
    let entries: ArchiveEntry[];
    try {
      entries = entriesOf(root);
    } catch {
      console.log(`| ${fullName} | not found | | |`);
      continue;
    }
    // No file-count or size limit: calibration looks at every file.
    const limits = { maxEntries: Number.MAX_SAFE_INTEGER, maxTotalBytes: Number.MAX_SAFE_INTEGER, timeBudgetMs: 3_600_000 };
    const report = toReport(await scanEntries(entries, infoFor(fullName), { limits }));
    counts[report.verdict] += 1;
    const rules = report.rules.map((r) => `${r.id} +${r.points}`).join(", ");
    console.log(`| ${fullName} | ${report.verdict} | ${report.score} | ${rules} |`);
  }
  console.log(`\n${Object.entries(counts).map(([v, n]) => `${v}: ${n}`).join(", ")}`);
}

void main();
