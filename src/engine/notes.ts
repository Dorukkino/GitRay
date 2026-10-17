/**
 * Finding notes, by key. A note is the one-line explanation under a finding.
 * Rules emit a key and arguments instead of a finished sentence, so the UI can
 * show the note in the visitor's language (src/i18n). This file holds the
 * English text (used by the CLI and the raw JSON); the dictionaries hold the
 * translations. Keep the keys and the {placeholders} here in sync with
 * `report.notes` in every dictionary (tests/i18n.test.ts checks this).
 */

export const NOTE_TEMPLATES = {
  // autorun
  npmScript: '"{name}" runs automatically on npm install',
  npmScriptNet: '"{name}" runs automatically on npm install and uses network or shell commands',
  installNet: "uses the network during install",
  installDownloads: "runs a process that downloads during install",
  installProcess: "runs a process during install",
  installDecodeExec: "executes decoded data during install",
  installDynExec: "executes dynamic code during install",
  installProcAndDownload: "can run processes and names a download tool",
  buildRisky: "build command downloads, decodes or hides what it runs",
  build: "build command runs on every build",
  buildNet: "uses the network at build time",
  buildDownload: "runs a download tool at build time",
  buildCmd: "runs a command at build time",
  buildCmdAndDownload: "runs commands and names a download tool",

  // binary / executables
  exePe: "Windows program (PE)",
  exeDll: "Windows library (DLL)",
  exeElf: "Linux program (ELF)",
  exeMacho: "macOS program (Mach-O)",
  exeMachoUniversal: "macOS universal program (Mach-O)",
  exeLnk: "Windows shortcut (.lnk)",
  zipPackageExe: "package archive (wheel, NuGet) containing a Windows program or library",
  zipExe: "ZIP archive containing a Windows program, launcher or disk image",
  zipEncrypted: "encrypted ZIP archive",
  rarEncrypted: "RAR archive with encrypted headers",
  avRepoKnown: "{bad} of {total} antivirus engines detect this file",
  avRepoMaybe: "{bad} of {total} antivirus engines detect this file (few detections: may be a false positive)",
  avReleaseKnown: "{bad} of {total} antivirus engines detect this release file",
  avReleaseMaybe: "{bad} of {total} antivirus engines detect this release file (few detections: may be a false positive)",

  // code
  evalUrlDecoded: "evaluates URL-decoded data from a variable",
  inContainer: "runs inside a container image build, not directly on your computer",
  browserCleaner: "only deletes browser data here; nothing in this file opens, copies, decrypts or sends it (privacy cleaners do this)",
  browserName: "names a browser password or cookie file but does not open, read, decrypt or send it (labels and settings mention these names too)",
  browserProfileDir: "points at the browser's profile folder but names no password or cookie file (settings, installed web apps and extensions live there too)",
  dpapiBrowser: "decrypts with Windows DPAPI next to browser password files",
  dpapiAlone: "decrypts with Windows DPAPI; no browser files referenced",
  sshSends: "the same file can send data over the network",
  sshNoNet: "no network use in the same file (SSH tools read keys too)",
  sshCi: "in a CI configuration: runs on a build server, not on your computer (deploy keys are set up this way)",
  sshData: "a path in a data or settings file, not code that reads a key",
  installerScript: "installer script: runs only when someone builds and runs the installer",
  runKeyWrite: "writes to a Run key: starts a program at every logon",
  runKeyName: "names a Run key but does not write to it (startup managers and cleaners list, compare and delete these entries)",
  execFileData: "runs code stored in a data file ({ext})",
  execFile: "runs code read from a file",

  // dependencies
  depVersion: "{name} {version} is a known malicious {ecosystem} package ({ids})",
  depAllVersions: "every version of {name} is a known malicious {ecosystem} package ({ids})",

  // devtools
  devcontainerRisky: "runs on the host and downloads or decodes something",
  devcontainer: "runs on the host before the container starts",
  vscodeProgram: '"{key}" points to a program in the repository',
  hookRisky: "hook command downloads or decodes something",
  hook: "hook command runs automatically",
  mcpRisky: "MCP server command downloads or decodes something",
  mcp: "project declares an MCP server command",
  npmrcNodeOptions: "every Node process started by npm loads this code",
  npmrcScriptShell: "every npm script runs through this program",
  envrcRemote: "runs when you enter the folder and fetches remote content",

  // links
  downloadHost: "downloads an executable or archive from {host}",
  downloadGithub: "download hosted on GitHub, but not from this repository's releases",
  downloadGithubSource: "downloads another repository's source archive from GitHub (reviewable source, not a packaged file)",
  downloadOtherArchive: "downloads a version of this repository that was not scanned (another branch or tag)",
  hostLink: "{host} link",
  sellsMalware: "offers {kinds} for sale",

  // obfuscation
  hexEscapes: "long run of \\xNN escape sequences",
  unicodeEscapes: "long run of \\uXXXX escape sequences",
  entropyString: "{len}-char string with entropy {e} bits/char",
  entropyHex: "{len}-char hex string with entropy {e} bits/char",
  offscreen: "code starts after {n} spaces",
  invisibleRun: "{n} invisible characters in a row",
  hangulFiller: "blank-looking Hangul filler used in code",
  stringArrayObfuscation: "{n} _0x… hex identifiers (machine-obfuscated code)",

  // repo
  accountNew: "owner account was created {days} days ago",
  archiveHidden: "{count} files missing from the archive ({sample})",
} as const;

export type NoteKey = keyof typeof NOTE_TEMPLATES;
export type NoteArgs = Record<string, string | number>;

function fill(template: string, args?: NoteArgs): string {
  return args ? template.replace(/\{(\w+)\}/g, (_, k) => (k in args ? String(args[k]) : `{${k}}`)) : template;
}

/** The English note text for a key, with its arguments filled in. */
export function noteText(key: NoteKey, args?: NoteArgs): string {
  return fill(NOTE_TEMPLATES[key], args);
}

/** What a rule spreads into a Hit to attach a translatable note. */
export function note(key: NoteKey, args?: NoteArgs): { note: string; noteKey: NoteKey; noteArgs?: NoteArgs } {
  return { note: noteText(key, args), noteKey: key, ...(args ? { noteArgs: args } : {}) };
}
