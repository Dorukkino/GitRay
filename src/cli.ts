/**
 * Command-line scanner: npm run scan -- owner/repo [--json]
 *
 * Exit codes: 0 clean, 1 suspicious, 2 dangerous, 3 error, 4 incomplete.
 */

import {
  GitHubClient,
  GiTRayError,
  InvalidTarget,
  OsvClient,
  type Report,
  parseTarget,
  scanRepo,
  toReport,
} from "./engine";
import { createReputationService } from "./lib/virustotal";

const EXIT = { clean: 0, suspicious: 1, dangerous: 2, error: 3, incomplete: 4 } as const;
const USAGE = "usage: npm run scan -- <owner/repo | github.com/owner/repo> [--json]";

const color = process.stdout.isTTY
  ? (code: number, s: string) => `\x1b[${code}m${s}\x1b[0m`
  : (_code: number, s: string) => s;

const VERDICT_COLOR = { clean: 32, suspicious: 33, dangerous: 31, incomplete: 36 } as const;

function printReport(r: Report): void {
  const out: string[] = [];
  if (r.target) {
    out.push(`${r.target.fullName} @ ${r.target.headSha.slice(0, 12)} (${r.target.defaultBranch})`);
    if (r.target.description) out.push(`  ${r.target.description}`);
  }
  out.push("");
  out.push(`Verdict: ${color(VERDICT_COLOR[r.verdict], r.verdict.toUpperCase())}   score ${r.score}/100`);
  if (r.partial) {
    out.push(`Partial scan: ${r.partial.reason} (${r.partial.filesScanned} files scanned)`);
  }
  if (r.testFilesCapped) {
    out.push("Held at suspicious: the score above 69 comes from test files, and nothing runs by itself on install");
  }
  out.push(
    `Scanned ${r.stats.textFiles} text and ${r.stats.binaryFiles} binary files with ${r.rulesRun} rules in ${(r.durationMs / 1000).toFixed(1)} s`,
  );
  if (r.stats.archiveMembers > 0) {
    out.push(`Read ${r.stats.archiveMembers} files from inside ${r.stats.archivesOpened} ZIP archives`);
  }
  const check = {
    ok: "Download archive check: complete",
    hidden: `Download archive check: ${r.archiveCheck.hidden} files hidden by export-ignore, ${r.archiveCheck.scanned} scanned separately`,
    unavailable: "Download archive check: file list unavailable",
    skipped: null,
  }[r.archiveCheck.status];
  if (check) out.push(check);
  const deps = r.dependencyCheck;
  const depLine = {
    ok: `Dependencies: ${deps.packages} packages checked against OSV, none known to be malicious`,
    found: `Dependencies: ${deps.malicious} of ${deps.packages} packages are known malware (OSV)`,
    unavailable: "Dependencies: OSV could not be reached",
    none: null,
    skipped: null,
  }[deps.status];
  if (depLine) out.push(depLine);
  const rep = r.reputationCheck;
  if (rep.status === "not_configured") out.push("VirusTotal: not checked (set VIRUSTOTAL_API_KEY)");
  else if (rep.status === "unavailable") out.push("VirusTotal: could not be reached");
  for (const f of rep.files) {
    const x = f.reputation;
    const result =
      x.status === "found"
        ? `${x.stats.malicious}/${x.stats.malicious + x.stats.suspicious + x.stats.harmless + x.stats.undetected} engines detect it`
        : x.status === "unknown"
          ? "unknown to VirusTotal"
          : `not looked up (${x.reason})`;
    out.push(`VirusTotal: ${f.name} (${f.source}): ${result}`);
  }
  if (rep.notLookedUp && rep.status !== "not_configured") out.push(`VirusTotal: ${rep.notLookedUp} more files not looked up (per-scan limit)`);
  if (r.submodules.length) {
    out.push(`Submodules (not scanned; git clone --recursive downloads them):`);
    for (const s of r.submodules) out.push(`  ${s.path} <- ${s.url}${s.github ? `  (scan: npm run scan -- ${s.github})` : ""}`);
  }
  if (r.rules.length) {
    out.push("", "Score breakdown:");
    for (const rule of r.rules) out.push(`  +${String(rule.points).padStart(2)}  ${rule.id}  ${rule.title} (${rule.findings})`);
  }
  if (r.findings.length) {
    out.push("", "Findings:");
    for (const f of r.findings) {
      const where = f.path ? `${f.path}${f.line ? `:${f.line}` : ""}` : "(repository)";
      out.push(`  [${f.severity.toUpperCase()}] ${f.ruleId} ${where}${f.testContext ? "  (test file)" : ""}`);
      out.push(`      ${f.title}${f.note ? ` - ${f.note}` : ""}`);
      if (f.snippet) out.push(`      > ${f.snippet}`);
    }
    if (r.omittedFindings) out.push(`  ... and ${r.omittedFindings} more`);
  }
  if (r.releaseAssets.length) {
    out.push("", "Release assets (not downloaded):");
    for (const a of r.releaseAssets) out.push(`  ${a.releaseTag} ${a.name}  ${a.sha256 ?? "no digest: cannot be checked"}`);
  }
  console.log(out.join("\n"));
}

export async function main(argv: string[]): Promise<number> {
  const args = argv.filter((a) => a !== "--json");
  const json = argv.includes("--json");
  if (args.length !== 1 || args[0].startsWith("-")) {
    console.error(USAGE);
    return EXIT.error;
  }
  try {
    const ref = parseTarget(args[0]);
    const client = new GitHubClient({ token: process.env.GITHUB_TOKEN });
    // Without a database: quota counters and cached answers live in this process only.
    const reputation = createReputationService(process.env.VIRUSTOTAL_API_KEY || undefined, null);
    const report = toReport(await scanRepo(ref, client, { osv: new OsvClient(), reputation }));
    if (json) console.log(JSON.stringify(report, null, 2));
    else printReport(report);
    return EXIT[report.verdict];
  } catch (e) {
    if (e instanceof InvalidTarget) console.error(`${e.message}\n${USAGE}`);
    else if (e instanceof GiTRayError) console.error(`error: ${e.message}`);
    else console.error(`unexpected error: ${e instanceof Error ? e.message : String(e)}`);
    return EXIT.error;
  }
}

if (process.argv[1]?.endsWith("cli.ts")) {
  // process.exit() would cut off output still being written to a pipe ("--json | jq").
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
