/**
 * GR-AUTO-006..010: developer-tool configuration that runs commands on its
 * own: dev containers, editor settings, AI coding assistants, npm and direnv.
 * Fake job-interview projects and poisoned repositories use these because the
 * victim only has to open the folder (and accept a trust prompt).
 */

import { extension, iterScanLines, parseJsonc, splitLines } from "../text";
import type { TextFile } from "../types";
import { note } from "../notes";
import { DOWNLOAD_TOOL, type Hit, type Rule, URL_PATTERN } from "./base";

/** Downloads, shells with inline code, encoded payloads or script hosts. */
const RISKY_COMMAND =
  /\b(?:curl|wget|powershell|pwsh|iwr|irm|invoke-webrequest|invoke-expression|iex|certutil|bitsadmin|mshta|rundll32|regsvr32|base64|frombase64string)\b|https?:\/\/|\b(?:ba|z)?sh\s+-c\b|\bcmd(?:\.exe)?\s+\/c\b|\bnode\s+-e\b|\bpython[0-9.]*\s+-c\b|\beval\b|\s-e(?:nc(?:odedcommand)?)?\s+[A-Za-z0-9+/=]{16,}/i;

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/** The first line containing `needle`, or containing `"key"`, for the snippet. */
function locate(content: string, needle: string, key?: string): { line: number; text: string } {
  const lines = splitLines(content);
  const probes = [needle.slice(0, 60), JSON.stringify(needle).slice(1, 61), key ? `"${key}"` : ""].filter(Boolean);
  for (const probe of probes) {
    const i = lines.findIndex((l) => l.includes(probe));
    if (i !== -1) return { line: i + 1, text: lines[i] };
  }
  return { line: 1, text: lines[0] ?? "" };
}

/** A command given as a string, an argv array, or an object of named commands. */
function commandStrings(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value] : [];
  if (Array.isArray(value)) return value.every((v) => typeof v === "string") && value.length ? [value.join(" ")] : [];
  if (isObject(value)) return Object.values(value).flatMap(commandStrings);
  return [];
}

const DEVCONTAINER: Rule = {
  id: "GR-AUTO-006",
  title: "Dev container runs a command on your computer",
  category: "autorun",
  weight: 10,
  appliesTo: [".devcontainer/devcontainer.json", ".devcontainer.json", ".devcontainer/*/devcontainer.json"],
  why:
    "initializeCommand runs on your own machine, not inside the container, as soon as you " +
    "choose \"Reopen in Container\" in VS Code or start the dev container with another tool. " +
    "A command that downloads or decodes something there is a payload, not a setup step.",
  *scanText(file: TextFile): Iterable<Hit> {
    const config = parseJsonc(file.content);
    if (!isObject(config)) return;
    for (const command of commandStrings(config.initializeCommand)) {
      const risky = RISKY_COMMAND.test(command);
      const { line, text } = locate(file.content, command, "initializeCommand");
      yield {
        line,
        text,
        weight: risky ? 40 : undefined,
        ...note(risky ? "devcontainerRisky" : "devcontainer"),
      };
    }
  },
};

// VS Code settings whose value is a program VS Code starts by itself.
const PROGRAM_SETTING =
  /(?:^|\.)(?:path|executablePath|interpreterPath|defaultInterpreterPath|pythonPath|nodePath|serverPath|binaryPath|toolsPath|exePath)$/i;
const PROGRAM_SETTING_PREFIX = /^(?:terminal\.integrated\.(?:shell|automationProfile|profiles)|go\.alternateTools)\b/;
// Local environments the user creates themselves (not committed) are the usual targets.
const OWN_ENVIRONMENT = /(?:^|[\\/])(?:\.?venv|env|node_modules)(?:[\\/]|$)/i;

/** A path that points into the repository rather than to a program on the user's system. */
function pointsIntoRepository(value: string): boolean {
  const v = value.trim();
  if (!v || /^[A-Za-z]:[\\/]|^[\\/]|^~/.test(v)) return false;
  if (OWN_ENVIRONMENT.test(v)) return false;
  if (/^\$\{(?:workspaceFolder|workspaceRoot|fileWorkspaceFolder)[^}]*\}/.test(v) || /^\.{1,2}[\\/]/.test(v)) return true;
  // A bare command such as "git" or "python3" is looked up on the user's PATH.
  return /[\\/]/.test(v) || /\.(?:exe|bat|cmd|ps1|sh|js|cjs|mjs|py|vbs)$/i.test(v);
}

function* settingEntries(value: unknown, key: string): Generator<[string, string]> {
  if (typeof value === "string") yield [key, value];
  else if (isObject(value)) for (const [k, v] of Object.entries(value)) yield* settingEntries(v, key ? `${key}.${k}` : k);
}

const EDITOR_PROGRAM: Rule = {
  id: "GR-AUTO-007",
  title: "Editor settings run a program from the repository",
  category: "autorun",
  weight: 30,
  appliesTo: [".vscode/settings.json", "*.code-workspace"],
  why:
    "Workspace settings such as git.path, php.validate.executablePath or a terminal profile " +
    "tell VS Code which program to start. When they point to a file inside the repository, " +
    "VS Code runs the attacker's program as soon as the folder is opened and trusted.",
  *scanText(file: TextFile): Iterable<Hit> {
    const parsed = parseJsonc(file.content);
    if (!isObject(parsed)) return;
    const settings = extension(file.path) === ".code-workspace" ? parsed.settings : parsed;
    if (!isObject(settings)) return;
    for (const [key, value] of settingEntries(settings, "")) {
      const programKey = PROGRAM_SETTING.test(key) || PROGRAM_SETTING_PREFIX.test(key);
      if (!programKey || !pointsIntoRepository(value)) continue;
      const leaf = key.split(".").pop() ?? key;
      const { line, text } = locate(file.content, value, leaf);
      yield { line, text, ...note("vscodeProgram", { key }) };
    }
  },
};

const HELPER_KEYS = ["apiKeyHelper", "awsAuthRefresh", "awsCredentialExport", "otelHeadersHelper"];

interface AssistantCommand {
  /** The full command line, arguments included. */
  command: string;
  /** The value of the "command" field (or helper key), used to find the line. */
  field: string;
  key: string;
}

/** The line of `"key": "<field>"`, falling back to the first mention of the value. */
function locateCommand(content: string, c: AssistantCommand): { line: number; text: string } {
  const pattern = new RegExp(`"${c.key}"\\s*:\\s*${JSON.stringify(c.field).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  const lines = splitLines(content);
  const i = lines.findIndex((l) => pattern.test(l));
  return i !== -1 ? { line: i + 1, text: lines[i] } : locate(content, c.field, c.key);
}

/** Commands found in AI-assistant configuration, split into hooks and MCP servers. */
function assistantCommands(config: Json): { hooks: AssistantCommand[]; servers: AssistantCommand[] } {
  const hooks: AssistantCommand[] = [];
  const servers: AssistantCommand[] = [];
  const walk = (value: unknown, inServers: boolean) => {
    if (Array.isArray(value)) return value.forEach((v) => walk(v, inServers));
    if (!isObject(value)) return;
    if (typeof value.command === "string") {
      const args = Array.isArray(value.args) ? value.args.filter((a): a is string => typeof a === "string") : [];
      const command = [value.command, ...args].join(" ");
      (inServers ? servers : hooks).push({ command, field: value.command, key: "command" });
    }
    for (const [k, v] of Object.entries(value)) walk(v, inServers || k === "mcpServers" || k === "servers");
  };
  for (const key of HELPER_KEYS) {
    const value = config[key];
    if (typeof value === "string") hooks.push({ command: value, field: value, key });
  }
  walk(config.hooks, false);
  walk(config.statusLine, false);
  walk(config.mcpServers, true);
  walk(config.servers, true);
  return { hooks, servers };
}

const ASSISTANT_HOOKS: Rule = {
  id: "GR-AUTO-008",
  title: "AI coding assistant runs commands automatically",
  category: "autorun",
  // A hook that runs a project file or prints text is like an install script; risky commands weigh 40.
  weight: 15,
  appliesTo: [
    ".claude/settings.json",
    ".claude/settings.local.json",
    ".cursor/hooks.json",
    ".gemini/settings.json",
    ".mcp.json",
    ".cursor/mcp.json",
    ".vscode/mcp.json",
  ],
  why:
    "Claude Code, Cursor and Gemini CLI run hook commands from the project's settings on " +
    "their own (for example when a session starts), and start the MCP servers a project " +
    "declares. Opening a poisoned repository with an AI assistant then runs its commands.",
  *scanText(file: TextFile): Iterable<Hit> {
    const config = parseJsonc(file.content);
    if (!isObject(config)) return;
    const { hooks, servers } = assistantCommands(config);
    for (const c of hooks) {
      const risky = RISKY_COMMAND.test(c.command);
      const { line, text } = locateCommand(file.content, c);
      yield {
        line,
        text,
        weight: risky ? 40 : undefined,
        ...note(risky ? "hookRisky" : "hook"),
      };
    }
    // MCP servers usually need the user's approval first, so they weigh less.
    for (const c of servers) {
      const risky = RISKY_COMMAND.test(c.command);
      const { line, text } = locateCommand(file.content, c);
      yield {
        line,
        text,
        weight: risky ? 35 : 10,
        ...note(risky ? "mcpRisky" : "mcp"),
      };
    }
  },
};

const NODE_PRELOAD = /^\s*node-options\s*=.*(?:--require|-r\s|--import|--loader|--experimental-loader)/i;
const SCRIPT_SHELL = /^\s*script-shell\s*=\s*(.+)$/i;
const STANDARD_SHELL = /^(?:(?:\/(?:usr\/)?bin\/)?(?:ba|z|da|k|fi)?sh|cmd(?:\.exe)?|powershell(?:\.exe)?|pwsh(?:\.exe)?)$/i;

const NPM_CONFIG: Rule = {
  id: "GR-AUTO-009",
  title: "npm configuration injects code into every script",
  category: "autorun",
  weight: 35,
  appliesTo: [".npmrc"],
  why:
    "A project .npmrc applies to every npm command run in the folder. node-options with " +
    "--require or --import loads a file into every Node process npm starts, and script-shell " +
    "replaces the shell that runs every script, so a single npm install or npm test runs it.",
  *scanText(file: TextFile): Iterable<Hit> {
    for (const { line, text } of iterScanLines(file.content)) {
      if (NODE_PRELOAD.test(text)) {
        yield { line, text, ...note("npmrcNodeOptions") };
        continue;
      }
      const shell = SCRIPT_SHELL.exec(text);
      if (shell && !STANDARD_SHELL.test(shell[1].trim().replace(/^["']|["']$/g, ""))) {
        yield { line, text, ...note("npmrcScriptShell") };
      }
    }
  },
};

const DIRENV_FETCH = /\bsource_url\b|\bsource_up\b.*https?:/;

const DIRENV: Rule = {
  id: "GR-AUTO-010",
  title: "direnv file downloads code",
  category: "autorun",
  weight: 20,
  appliesTo: [".envrc"],
  why:
    "direnv runs .envrc every time you enter the folder in a terminal, once you have allowed " +
    "it with \"direnv allow\". Exporting variables is normal; downloading or fetching a remote " +
    "script there runs code you have not seen on every cd.",
  *scanText(file: TextFile): Iterable<Hit> {
    for (const { line, text } of iterScanLines(file.content)) {
      if (/^\s*#/.test(text)) continue;
      if (DIRENV_FETCH.test(text) || DOWNLOAD_TOOL.test(text) || (URL_PATTERN.test(text) && /\b(?:source|eval)\b/.test(text))) {
        yield { line, text, ...note("envrcRemote") };
      }
    }
  },
};

export const RULES: readonly Rule[] = [DEVCONTAINER, EDITOR_PROGRAM, ASSISTANT_HOOKS, NPM_CONFIG, DIRENV];
