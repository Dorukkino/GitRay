/**
 * GR-AUTO-*: files that run code automatically, on install, build or when the
 * folder is opened. This is where repo malware hurts the person who clones it.
 */

import { iterScanLines, splitLines } from "../text";
import type { TextFile } from "../types";
import { DOWNLOAD_TOOL, type Hit, type Rule, URL_PATTERN, lineAt, lineText, regexRule } from "./base";

/** npm runs these automatically ("prepublish" still runs on a local "npm install"). */
const LIFECYCLE_SCRIPTS = [
  "preinstall",
  "install",
  "postinstall",
  "prepublish",
  "prepare",
  "preuninstall",
  "uninstall",
  "postuninstall",
];

const RISKY_COMMAND =
  /\b(?:curl|wget|powershell|pwsh|iwr|irm|certutil|bitsadmin|mshta)\b|https?:\/\/|\b(?:ba)?sh\s+-c\b|\bnode\s+-e\b|\bpython[0-9.]*\s+-c\b|\beval\b|\bbase64\b|\|\s*(?:ba)?sh\b/i;

function findKeyLine(content: string, key: string): { line: number; text: string } {
  const pattern = new RegExp(`"${key}"\\s*:`);
  const lines = splitLines(content);
  for (let i = 0; i < lines.length; i++) if (pattern.test(lines[i])) return { line: i + 1, text: lines[i] };
  return { line: 1, text: lines[0] ?? "" };
}

const NPM_LIFECYCLE: Rule = {
  id: "GR-AUTO-001",
  title: "package.json runs a script on install",
  category: "autorun",
  weight: 15,
  appliesTo: ["package.json"],
  why:
    "npm runs lifecycle scripts (preinstall, postinstall, ...) automatically during " +
    "\"npm install\", before you have used or reviewed anything. Malicious packages and " +
    "repositories use them to run code on the developer's machine.",
  *scanText(file: TextFile): Iterable<Hit> {
    let data: unknown;
    try {
      data = JSON.parse(file.content);
    } catch {
      return;
    }
    const scripts = typeof data === "object" && data !== null ? (data as Record<string, unknown>).scripts : null;
    if (typeof scripts !== "object" || scripts === null) return;
    for (const name of LIFECYCLE_SCRIPTS) {
      const command = (scripts as Record<string, unknown>)[name];
      if (typeof command !== "string") continue;
      const risky = RISKY_COMMAND.test(command);
      const { line, text } = findKeyLine(file.content, name);
      yield {
        line,
        text,
        weight: risky ? 35 : undefined,
        note: `"${name}" runs automatically on npm install${risky ? " and uses network or shell commands" : ""}`,
      };
    }
  },
};

const SETUP_NETWORK =
  /\b(?:urllib\.request|urlopen|urlretrieve|requests\.(?:get|post)|http\.client|socket\.socket|httpx\.(?:get|post)|urllib3)\b/;
const SETUP_PROCESS = /\bsubprocess\.\w+|\bos\.(?:system|popen|exec\w*|spawn\w*)\s*\(/;
const SETUP_DYNAMIC = /\b(?:exec|eval)\s*\(|\b__import__\s*\(/;
const SETUP_DECODE = /\b(?:b64decode|b32decode|b85decode|a85decode|decompress|fromhex|unhexlify|decodebytes|codecs\.decode)\b/;
const IMPORT_ONLY = /^\s*(?:import\s|from\s+\S+\s+import\s)/;
/** Able to run processes at all (imports included: an alias can hide the call). */
const PROCESS_CAPABILITY = /\bsubprocess\b|\bos\.(?:system|popen|exec\w*|spawn\w*)\b|\bfrom[ \t]+os[ \t]+import[^\n]*\b(?:system|popen|exec\w*|spawn\w*)\b/;

const SETUP_PY: Rule = {
  id: "GR-AUTO-002",
  title: "setup.py runs commands or uses the network",
  category: "autorun",
  weight: 10,
  appliesTo: ["setup.py"],
  why:
    "pip executes setup.py when the package is installed from source. Reading a compiler " +
    "version is common, but downloading data, running download tools or evaluating decoded " +
    "code there means a payload runs on install.",
  *scanText(file: TextFile): Iterable<Hit> {
    const decodes = SETUP_DECODE.test(file.content);
    let escalated = false;
    for (const { line, text } of iterScanLines(file.content)) {
      // Only calls are reported; a bare import does nothing by itself.
      if (IMPORT_ONLY.test(text)) continue;
      let hit: Hit | null = null;
      if (SETUP_NETWORK.test(text)) {
        hit = { line, text, weight: 35, note: "uses the network during install" };
      } else if (SETUP_PROCESS.test(text)) {
        hit =
          URL_PATTERN.test(text) || DOWNLOAD_TOOL.test(text)
            ? { line, text, weight: 35, note: "runs a process that downloads during install" }
            : { line, text, note: "runs a process during install" };
      } else if (SETUP_DYNAMIC.test(text)) {
        hit = decodes
          ? { line, text, weight: 35, note: "executes decoded data during install" }
          : { line, text, note: "executes dynamic code during install" };
      }
      if (hit) {
        escalated ||= hit.weight === 35;
        yield hit;
      }
    }
    // Aliased calls ("from subprocess import run as r; r(['curl', ...])") hide the
    // process call, so a download tool anywhere in a file that can run processes counts.
    if (!escalated && PROCESS_CAPABILITY.test(file.content)) {
      const m = DOWNLOAD_TOOL.exec(file.content);
      if (m) {
        const line = lineAt(file.content, m.index);
        yield { line, text: lineText(file.content, line), weight: 35, note: "can run processes and names a download tool" };
      }
    }
  },
};

const VSCODE_FOLDER_OPEN = regexRule({
  id: "GR-AUTO-003",
  title: "VS Code task runs when the folder is opened",
  category: "autorun",
  weight: 35,
  appliesTo: [".vscode/tasks.json", "*.code-workspace"],
  why:
    'A task with "runOn": "folderOpen" starts automatically when the repository is opened ' +
    "in VS Code (once the workspace is trusted). Fake job-interview and \"take-home test\" " +
    "repositories use this to run malware on developers' machines.",
  patterns: [/["']?runOn["']?\s*:\s*["']folderOpen["']/i],
});

const MSBUILD_RISKY =
  /\b(?:powershell|pwsh|curl|wget|certutil|bitsadmin|mshta|rundll32|regsvr32|wscript|cscript|iex|invoke-expression|invoke-webrequest|frombase64string)\b|\s-e(?:nc(?:odedcommand)?)?\s|https?:\/\//i;
const MSBUILD_EVENT = /<(PreBuildEvent|PostBuildEvent|PreLinkEvent)>([\s\S]{0,5000}?)<\/\1>|<Exec\b[^>]{0,2000}?\bCommand\s*=\s*"([^"]{0,5000})"/gi;

const MSBUILD_EVENTS: Rule = {
  id: "GR-AUTO-004",
  title: "Visual Studio project runs a command on build",
  category: "autorun",
  weight: 15,
  appliesTo: ["*.csproj", "*.vbproj", "*.fsproj", "*.vcxproj", "*.vcproj", "*.props", "*.targets", "*.proj"],
  why:
    "Build events and Exec tasks run commands as soon as the project is built in Visual " +
    "Studio. Campaigns targeting security researchers shipped project files whose build " +
    "event launched PowerShell to install a backdoor.",
  *scanText(file: TextFile): Iterable<Hit> {
    for (const m of file.content.matchAll(MSBUILD_EVENT)) {
      const command = (m[2] ?? m[3] ?? "").replace(/<\/?Command>/gi, "").trim();
      if (!command) continue;
      const line = lineAt(file.content, m.index);
      const risky = MSBUILD_RISKY.test(command);
      yield {
        line,
        text: lineText(file.content, line),
        weight: risky ? 40 : undefined,
        note: risky ? "build command uses PowerShell, download tools or URLs" : "build command runs on every build",
      };
    }
  },
};

const RUST_COMMAND = /\bCommand::new\s*\(/;
const RUST_NETWORK = /\b(?:reqwest|ureq|curl::|attohttpc|minreq|TcpStream::connect)\b/;

const BUILD_RS: Rule = {
  id: "GR-AUTO-005",
  title: "Rust build script runs commands or downloads",
  category: "autorun",
  weight: 5,
  appliesTo: ["build.rs"],
  why:
    "Cargo compiles and runs build.rs before building the crate, so it runs on \"cargo build\" " +
    "and in IDEs that build on open. Calling git or pkg-config is normal; downloading or " +
    "starting PowerShell is how malicious crates deliver payloads.",
  *scanText(file: TextFile): Iterable<Hit> {
    let escalated = false;
    for (const { line, text } of iterScanLines(file.content)) {
      if (RUST_NETWORK.test(text) && !/^\s*(?:use|extern crate)\b/.test(text)) {
        escalated = true;
        yield { line, text, weight: 35, note: "uses the network at build time" };
      } else if (RUST_COMMAND.test(text)) {
        const downloads = URL_PATTERN.test(text) || DOWNLOAD_TOOL.test(text);
        escalated ||= downloads;
        yield downloads
          ? { line, text, weight: 35, note: "runs a download tool at build time" }
          : { line, text, note: "runs a command at build time" };
      }
    }
    if (!escalated && RUST_COMMAND.test(file.content)) {
      const m = DOWNLOAD_TOOL.exec(file.content);
      if (m) {
        const line = lineAt(file.content, m.index);
        yield { line, text: lineText(file.content, line), weight: 35, note: "runs commands and names a download tool" };
      }
    }
  },
};

/** Shared with GR-CODE-002: a download piped straight into a shell or interpreter. */
const PIPE = String.raw`(?<!\|)\|(?!\|)`;
const BIN = String.raw`(?:(?:/usr(?:/local)?)?/bin/)?`;
const LAUNCHER = String.raw`(?:sudo\s+(?:-\S+\s+)*)?` + BIN + String.raw`(?:env\s+(?:-\S+\s+)*)?` + BIN;
const SHELL = LAUNCHER + String.raw`(?:ba|z|da|k)?sh\b`;
const INTERP = LAUNCHER + String.raw`(?:python[0-9.]*|perl|ruby|node)\b`;

export const PIPE_TO_SHELL_PATTERNS: readonly RegExp[] = [
  new RegExp(String.raw`\b(?:curl|wget)\b[^|\n]{0,300}` + PIPE + String.raw`\s*(?:` + SHELL + "|" + INTERP + ")"),
  /\b(?:ba|z)?sh\s+-c\s+["']?\$\(\s*(?:curl|wget)\b/,
  /\b(?:ba|z)?sh\s+<\(\s*(?:curl|wget)\b/,
  new RegExp(
    String.raw`\b(?:iwr|irm|invoke-webrequest|invoke-restmethod|downloadstring)\b[^|\n]{0,300}` +
      PIPE +
      String.raw`\s*(?:iex|invoke-expression)\b`,
    "i",
  ),
  /\b(?:iex|invoke-expression)\s*\(?\s*\(?\s*(?:new-object\s+(?:system\.)?net\.webclient\)\s*\.downloadstring|iwr|irm|invoke-webrequest|invoke-restmethod)\b/i,
];

export const WORKFLOW_PATHS = [".github/workflows/*.yml", ".github/workflows/*.yaml"];

const CI_PIPE_TO_SHELL = regexRule({
  id: "GR-CI-001",
  title: "CI workflow pipes a download into a shell",
  category: "ci",
  weight: 5,
  appliesTo: WORKFLOW_PATHS,
  why:
    "The workflow downloads a script and runs it in GitHub Actions. This runs on GitHub's " +
    "servers, not on the machine of whoever clones the repository, so it weighs little; " +
    "it still means whoever controls that URL controls the build.",
  patterns: PIPE_TO_SHELL_PATTERNS,
});

export const RULES: readonly Rule[] = [NPM_LIFECYCLE, SETUP_PY, VSCODE_FOLDER_OPEN, MSBUILD_EVENTS, BUILD_RS, CI_PIPE_TO_SHELL];
