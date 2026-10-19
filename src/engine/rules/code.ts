/** GR-CODE-*: dangerous code patterns. Down-weighted inside documentation files. */

import { extension, isReleaseNotes, iterScanLines, splitLines } from "../text";
import type { TextFile } from "../types";
import { note } from "../notes";
import { type Hit, type Rule, pathMatches, regexRule } from "./base";
import { CI_PATHS, CONTAINER_BUILD_PATHS, pipeToShellHits } from "./autorun";

const PIPE = String.raw`(?<!\|)\|(?!\|)`;
const SHELL = String.raw`(?:sudo\s+)?(?:(?:/usr(?:/local)?)?/bin/)?(?:ba|z|da|k)?sh\b`;

const DECODE_EXEC_PATTERNS = regexRule({
  id: "GR-CODE-001",
  title: "Decodes hidden code and executes it",
  category: "code",
  weight: 45,
  docWeight: 5,
  why:
    "Code is decoded (base64, hex, zlib, ...) and handed straight to an interpreter. " +
    "Legitimate projects rarely hide what they run; malware does this to get past " +
    "reviewers and scanners.",
  patterns: [
    // Python: exec/eval of decoded or decompressed data.
    /\b(?:exec|eval)\s*\(.{0,60}?\b(?:b64decode|b32decode|b85decode|a85decode|decompress|fromhex|unhexlify|decodebytes|marshal\.loads|codecs\.decode)\s*\(/,
    // JavaScript: eval/Function of decoded data. URL-decoding a variable is GR-CODE-001's
    // weak form (old code parsing cookies); URL-decoding an encoded literal is not.
    /\beval\s*\(\s*atob\s*\(/,
    /\beval\s*\(\s*(?:unescape|decodeURIComponent)\s*\(\s*["'`]/,
    /\beval\s*\(\s*Buffer\.from\s*\(.{0,200}?['"](?:base64|hex)['"]/,
    /\b(?:new\s+)?Function\s*\(\s*(?:atob\s*\(|Buffer\.from\s*\()/,
    /\beval\s*\(\s*String\.fromCharCode\s*\(/,
    // JavaScript packer signature eval(function(p,a,c,k,e,d){...}): the Dean-Edwards
    // packer that malware uses to ship an unreadable payload. Six comma-separated
    // params after eval(function( is near-unique to packed code; legit code does not
    // eval a six-argument function literal.
    /\beval\s*\(\s*function\s*\(\s*[\w$]+\s*(?:,\s*[\w$]+\s*){5}\)/,
    // Shell: base64 -d piped into a shell.
    new RegExp(String.raw`\bbase64\s+(?:-d|--decode|-D)\b[^|\n]{0,80}` + PIPE + String.raw`\s*` + SHELL),
    // PowerShell: encoded command or IEX of a base64 payload.
    /\b(?:powershell|pwsh)(?:\.exe)?\b.{0,80}?\s-e(?:nc(?:odedcommand)?)?\s+[A-Za-z0-9+/=]{16,}/i,
    /\b(?:iex|invoke-expression)\b.{0,120}?frombase64string/i,
    new RegExp(String.raw`frombase64string.{0,200}?` + PIPE + String.raw`\s*(?:iex|invoke-expression)\b`, "i"),
    // Running the text of a regular expression: a payload hidden in a pattern, where
    // scanners (this one included) count it as a search pattern rather than code.
    /(?:(?<![\w.$])eval|\bFunction|\bexecSync|\bexecFileSync|\bspawnSync)\s*\([^)\n]{0,100}?\.source\b/,
    /(?<![\w.$])(?:exec|eval)\s*\([^)\n]{0,100}?\.pattern\b/,
  ],
});

/** eval of URL-decoded data held in a variable: old code parsing cookies or query strings does this. */
const EVAL_URL_DECODED = /\beval\s*\(\s*(?:unescape|decodeURIComponent)\s*\(/;

/** JavaScript eval/Function of a decoded value: eval(atob(x)), eval(Buffer.from(x,'base64')), Function(atob(x)). */
const JS_DECODE_RUN = /\b(?:eval|(?:new\s+)?Function)\s*\(\s*(?:atob|Buffer\.from)\s*\(/;
/** The first identifier handed to that decode call: atob(name, Buffer.from(name, Buffer.from('${name}'. */
const DECODED_OPERAND = /(?:atob|Buffer\.from)\s*\(\s*['"`]?\$?\{?\s*([A-Za-z_$][\w$]*)/;

/**
 * True when `name` holds a base64/hex string this same file produced by encoding
 * its own visible source (btoa(x), Buffer.from(x).toString("base64")). Decoding
 * it back and running it is a transport or shell-quoting round-trip, not a hidden
 * payload: the plaintext source is right there for a reviewer to read. Malware
 * ships an opaque literal blob instead, which this never matches.
 */
function locallyEncoded(content: string, name: string): boolean {
  const id = name.replace(/[.$]/g, "\\$&");
  const encode = "\\b" + id + "\\b\\s*=\\s*[^\\n;]*?(?:\\.toString\\s*\\(\\s*['\"`](?:base64|hex)['\"`]|\\bbtoa\\s*\\()";
  return new RegExp(encode).test(content);
}

const DECODE_EXEC: Rule = {
  ...DECODE_EXEC_PATTERNS,
  *scanText(file: TextFile, ctx): Iterable<Hit> {
    const strong = new Set<number>();
    for (const hit of DECODE_EXEC_PATTERNS.scanText!(file, ctx)) {
      strong.add(hit.line);
      // Decoding a value this file just encoded from visible source (a shell-quoting
      // or transport trick) hides nothing, so it stays a weak signal, not a decisive one.
      if (JS_DECODE_RUN.test(hit.text)) {
        const name = DECODED_OPERAND.exec(hit.text)?.[1];
        if (name && locallyEncoded(file.content, name)) {
          yield { ...hit, weight: 5, ...note("localRoundTrip") };
          continue;
        }
      }
      yield hit;
    }
    for (const { line, text } of iterScanLines(file.content)) {
      if (strong.has(line)) continue;
      const m = EVAL_URL_DECODED.exec(text);
      if (m) yield { line, text, column: m.index, weight: 10, ...note("evalUrlDecoded") };
    }
  },
};

const PIPE_TO_SHELL: Rule = {
  id: "GR-CODE-002",
  title: "Downloads a script and pipes it into a shell",
  category: "code",
  weight: 35,
  // "curl ... | sh" is a common, legitimate install line in READMEs.
  docWeight: 0,
  // CI configurations run on a build server: see GR-CI-001.
  exclude: CI_PATHS,
  why:
    "A remote script is downloaded and executed immediately, without being saved or " +
    "reviewed. Whoever controls that URL controls your machine.",
  *scanText(file: TextFile): Iterable<Hit> {
    // An HTML page shows install instructions and a changelog reports history; a
    // "curl | sh" there is displayed text or data, not a script that runs when the
    // repository is cloned — the same reason it is dropped inside a README.
    const ext = extension(file.path);
    if (ext === ".html" || ext === ".htm" || isReleaseNotes(file.path)) return;
    const container = pathMatches(file.path, CONTAINER_BUILD_PATHS);
    for (const hit of pipeToShellHits(file)) {
      yield container ? { ...hit, weight: 5, ...note("inContainer") } : hit;
    }
  },
};

/** Specific credential artifacts: only an info-stealer names these exact files or keys. */
const CREDENTIAL_FILES: readonly RegExp[] = [
  /["'\\/]Login Data\b/,
  /\blogins\.json\b/,
  /\bkey[34]\.db\b/,
  /\bcookies\.sqlite\b/,
  // "encrypted_key" alone is a standard JWE field; Chrome's os_crypt key is the indicator.
  /Local State.{0,200}?os_crypt/i,
  /os_crypt.{0,40}?encrypted_key/i,
];
/**
 * The browser's profile folder. Ordinary code reads it too (settings, installed
 * PWAs, extensions), so on its own — with no credential file named in the file —
 * it is a weak signal, not credential theft.
 */
const PROFILE_DIRS: readonly RegExp[] = [
  /(?:Google[\\/]+Chrome|BraveSoftware[\\/]+Brave-Browser|Microsoft[\\/]+Edge|Opera Software[\\/]+Opera (?:Stable|GX Stable)|Yandex[\\/]+YandexBrowser)[\\/]+(?:User Data|Default)/i,
  /Mozilla[\\/]+Firefox[\\/]+Profiles/i,
];
const BROWSER_STORES: readonly RegExp[] = [...CREDENTIAL_FILES, ...PROFILE_DIRS];
/** Windows DPAPI: browsers encrypt saved passwords with it, but so do many ordinary programs. */
const DPAPI = /\bCryptUnprotectData\b/;
/** Chrome's key for saved passwords: only a stealer needs it, whatever else the file does. */
const BROWSER_KEY = /os_crypt/i;
/** Deleting files or folders: privacy cleaners wipe browser cookies, history and caches. */
const DELETES =
  /\b(?:File|Directory)\.Delete\b|\bDeleteFile[AW]?\b|\bos\.(?:remove|unlink|rmdir|RemoveAll|Remove)\b|\bshutil\.rmtree\b|\bRemove-Item\b|\b(?:unlink|rm|rmdir)Sync\b|\bfs(?:\.promises)?\.(?:unlink|rm|rmdir)\b|\bremove_(?:file|dir_all)\b|\.Delete\s*\(|\.unlink\s*\(|^\s*(?:del|rd|rmdir|rm)\s+[-/]/im;
/**
 * What a stealer does with a browser store and a cleaner never needs: open the
 * database, decrypt or copy it, read it whole, or send something out. A path
 * ending in ".sqlite" is not a database library.
 */
const STEALS =
  /(?<![.\w])sqlite3?\b|\brusqlite\b|\bData\.Sqlite\b|\bSQLite(?:Connection|Command|DataReader)\b|\bpassword_value\b|\bencrypted_value\b|\bCryptUnprotectData\b|\bReadAll(?:Bytes|Text|Lines)\b|\bFile\.Copy\b|\bshutil\.copy|\bcopyfile\b|\bcopyFile(?:Sync)?\b|\bCopy-Item\b|\breadFile(?:Sync)?\b|\bopen\s*\([^)\n]{0,200}["']rb["']|\bread_bytes\b/i;

/**
 * Data, settings and string-table files (translations, INI, XML/JSON/YAML config):
 * labels and values, never executable code. A sensitive name here is a label or a
 * path in config, and words like "SQLite" or "curl" in it are not code that runs.
 * (.reg is left out: it is applied as a whole and handled by GR-CODE-007.)
 */
const DATA_FILE_EXTENSIONS = new Set([
  ".ini",
  ".po",
  ".pot",
  ".properties",
  ".strings",
  ".resx",
  ".xml",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".plist",
  ".csv",
  ".tsv",
  ".cfg",
  ".conf",
  ".config",
]);

const BROWSER_CREDENTIALS: Rule = {
  id: "GR-CODE-003",
  title: "Reads browser password or cookie stores",
  category: "code",
  weight: 40,
  docWeight: 5,
  why:
    "References the files where browsers keep saved passwords, cookies and the keys that " +
    "decrypt them. Info-stealer malware goes after exactly these files.",
  *scanText(file: TextFile): Iterable<Hit> {
    // DPAPI next to a browser store is a stealer; DPAPI alone is ordinary Windows code.
    const browserStore = BROWSER_STORES.some((p) => p.test(file.content));
    // A data or settings file (translations, INI, XML/JSON/YAML config) holds labels and
    // values, not code: a store name there is only a label, so it reads or sends nothing.
    const dataFile = DATA_FILE_EXTENSIONS.has(extension(file.path));
    // Does the whole file name a specific credential file? Then even a profile-folder
    // reference is part of credential access. Without one, a profile folder is benign.
    const namesCredentialFile = CREDENTIAL_FILES.some((p) => p.test(file.content));
    // A file that deletes browser data and never opens, copies, decrypts or sends it is a cleaner.
    const cleaner = browserStore && DELETES.test(file.content) && !STEALS.test(file.content) && !NETWORK_SEND.test(file.content);
    for (const { line, text } of iterScanLines(file.content)) {
      const store = BROWSER_STORES.map((p) => p.exec(text)).find((m) => m !== null);
      if (store) {
        const credentialOnLine = CREDENTIAL_FILES.some((p) => p.test(text));
        if (dataFile) {
          yield { line, text, column: store.index, weight: 10, ...note("browserName") };
        } else if (!credentialOnLine && !namesCredentialFile) {
          // Only the browser's profile folder, no credential file anywhere: settings/PWA/extension code.
          yield { line, text, column: store.index, weight: 10, ...note("browserProfileDir") };
        } else {
          yield cleaner && !BROWSER_KEY.test(text)
            ? { line, text, column: store.index, weight: 10, ...note("browserCleaner") }
            : { line, text, column: store.index };
        }
        continue;
      }
      const dpapi = DPAPI.exec(text);
      if (dpapi) {
        yield browserStore
          ? { line, text, column: dpapi.index, ...note("dpapiBrowser") }
          : { line, text, column: dpapi.index, weight: 10, ...note("dpapiAlone") };
      }
    }
  },
};

const SSH_KEY_PATTERNS = regexRule({
  id: "GR-CODE-004",
  title: "Reads SSH private keys",
  category: "code",
  weight: 25,
  docWeight: 3,
  why:
    "References SSH private keys or authorized_keys. Stolen private keys give access to " +
    "servers and GitHub; writing to authorized_keys plants a backdoor.",
  patterns: [
    /\.ssh[\\/]+(?:id_(?:rsa|dsa|ecdsa|ed25519)(?:_sk)?|authorized_keys)\b(?!\.pub)/,
    /["']\.ssh["']\s*[,)]/,
  ],
});

/** Ways to send data out. A stealer reads the key and ships it; SSH tooling only reads it. */
const NETWORK_SEND =
  /\b(?:fetch|axios|XMLHttpRequest|sendBeacon|https?\.(?:request|get)|request\.post|requests\.(?:post|put|get)|urlopen|urllib|http\.client|httpx|net\.connect|socket\.(?:socket|connect|send)|WebClient|UploadString|UploadFile|Invoke-WebRequest|Invoke-RestMethod|smtplib|ftplib|curl|wget)\b|\b(?:nc|ncat|netcat)\s+(?:-\S+\s+)*[\w.-]+\s+\d{2,5}\b|discord(?:app)?\.com\/api\/webhooks|api\.telegram\.org/i;
/** Planting a key in authorized_keys is a backdoor by itself; no network needed. */
const AUTHORIZED_KEYS = /authorized_keys/;

const SSH_KEYS: Rule = {
  ...SSH_KEY_PATTERNS,
  *scanText(file: TextFile, ctx): Iterable<Hit> {
    // CI configurations run on a build server, not on the cloner's machine, and set up
    // their own deploy keys there (echo "$key" > ~/.ssh/id_rsa). Low signal, like GR-CI-001.
    const ci = pathMatches(file.path, CI_PATHS);
    // A path in a data or settings file is configuration, not code that reads a key.
    const dataFile = DATA_FILE_EXTENSIONS.has(extension(file.path));
    const sends = NETWORK_SEND.test(file.content);
    for (const hit of SSH_KEY_PATTERNS.scanText!(file, ctx)) {
      if (ci || dataFile) {
        yield { ...hit, weight: 10, ...note(ci ? "sshCi" : "sshData") };
        continue;
      }
      if (AUTHORIZED_KEYS.test(hit.text)) {
        yield hit;
        continue;
      }
      yield sends
        ? { ...hit, ...note("sshSends") }
        : { ...hit, weight: 15, ...note("sshNoNet") };
    }
  },
};

const CRYPTO_WALLETS = regexRule({
  id: "GR-CODE-005",
  title: "Reads cryptocurrency wallet files",
  category: "code",
  weight: 35,
  docWeight: 5,
  why:
    "References wallet files, wallet application folders or wallet browser extensions. " +
    "Crypto-stealing malware searches for exactly these.",
  patterns: [
    /\bwallet\.dat\b/,
    /\bexodus\.wallet\b/,
    // Extension IDs: MetaMask, Phantom, Coinbase Wallet, Trust Wallet.
    /\b(?:nkbihfbeogaeaoehlefnkodbefgpgknn|bfnaelmomeimhlpmgjnjophhpkkoljpa|hnfanknocfeofbddgcijnmhnfnkdnaad|egjidjbpglichdcondbcbdnbeeppgdph)\b/,
    /[\\/]\.?(?:Electrum[\\/]+wallets|Ethereum[\\/]+keystore|atomic[\\/]+Local Storage|Bitcoin[\\/]+wallets|Exodus[\\/]+exodus\.wallet)/i,
  ],
});

const EXFIL_ENDPOINTS = regexRule({
  id: "GR-CODE-006",
  title: "Sends data to a Discord webhook or Telegram bot",
  category: "code",
  weight: 25,
  docWeight: 5,
  why:
    "A hard-coded Discord webhook or Telegram bot token is the most common way stealer " +
    "malware ships stolen passwords, cookies and files to the attacker: no server needed.",
  patterns: [
    /\bdiscord(?:app)?\.com\/api\/webhooks\/\d{5,}\/[\w-]{20,}/i,
    /\bapi\.telegram\.org\/bot\d{5,}:[\w-]{30,}/i,
  ],
});

const LOLBIN_PATTERNS = regexRule({
  id: "GR-CODE-007",
  title: "Uses Windows tools to download, hide or persist",
  category: "code",
  weight: 35,
  docWeight: 5,
  why:
    "Built-in Windows programs (certutil, bitsadmin, mshta, rundll32, regsvr32) can download " +
    "and run payloads, and Defender exclusions, hidden PowerShell windows and writing to the " +
    "Run keys are how malware hides and survives a reboot. Normal projects almost never need these.",
  patterns: [
    /\bcertutil(?:\.exe)?\s[^\n]{0,60}-(?:urlcache|decode)\b/i,
    /\bbitsadmin(?:\.exe)?\s[^\n]{0,60}\/transfer\b/i,
    /\bmshta(?:\.exe)?\s+["']?(?:https?:|javascript:|vbscript:)/i,
    /\brundll32(?:\.exe)?\s[^\n]{0,80}javascript:/i,
    /\bregsvr32(?:\.exe)?\s[^\n]{0,80}\/i:\s*["']?https?:/i,
    /\bAdd-MpPreference\b[^\n]{0,60}-Exclusion(?:Path|Process|Extension)\b/i,
    /\bSet-MpPreference\b[^\n]{0,60}-Disable(?:RealtimeMonitoring|IOAVProtection|BehaviorMonitoring|ScriptScanning)\b/i,
    /\b(?:powershell|pwsh)(?:\.exe)?\b[^\n]{0,120}-(?:w|win|windowstyle)\s+hidden\b/i,
  ],
});

/** The registry keys Windows reads at logon to start programs. */
const RUN_KEY = /\\CurrentVersion\\Run(?:Once)?\b/i;
/** Setting a registry value: reg add, PowerShell, .NET, Win32, Python winreg, Go, VBScript, NSIS, Delphi. */
const VALUE_WRITE =
  /\breg(?:\.exe)?\s+(?:add|import)\b|\b(?:New|Set)-ItemProperty\b|\.SetValue\s*\(|\bSetValueEx[AW]?\b|\bRegSetValue|\bRegSetKeyValue|\bSet(?:String|ExpandString|DWord|QWord|Binary|Strings)Value\b|\bRegWrite\b|\bWriteReg(?:Str|ExpandStr|DWORD|Bin)\b|\bWriteString\b/i;
/** Creating a key opens it for writing. */
const CREATE_KEY = /\b(?:CreateSubKey|CreateKey(?:Ex)?|RegCreateKeyEx[AW]?)\s*\(/;
/** Opening a key, and the flags that open it for writing. */
const OPEN_KEY = /\b(?:OpenSubKey|OpenKey(?:Ex)?|RegOpenKeyEx[AW]?)\s*\(/;
const WRITABLE = /,\s*true\s*\)|\bKEY_(?:SET_VALUE|WRITE|ALL_ACCESS)\b|\bregistry\.(?:SET_VALUE|WRITE|ALL_ACCESS)\b/i;
/** A name given to the Run key path: `const string Run = @"...\Run"`, `RUN = r"..."`, `$p = "HKCU:\...\Run"`. */
const RUN_KEY_NAME = /([$\w.]+)\s*:?=\s*[@rR]?["'`][^"'`\n]{0,200}\\CurrentVersion\\Run(?:Once)?\b/;

/** True when the line writes to the key it names (the Run path itself or a name holding it). */
function writesKey(line: string): boolean {
  return VALUE_WRITE.test(line) || CREATE_KEY.test(line) || (OPEN_KEY.test(line) && WRITABLE.test(line));
}

/**
 * Startup managers and cleaners name the Run keys to list, compare or delete
 * entries; persistence writes a value into them. A write counts only when it
 * targets the Run key: on the same line as its path, or through a name the path
 * was assigned to. A write to another key nearby does not count.
 */
function writesRunKey(lines: readonly string[], index: number): boolean {
  const text = lines[index];
  if (writesKey(text)) return true;
  const name = RUN_KEY_NAME.exec(text)?.[1];
  if (!name) return false;
  const token = new RegExp(`(?<![\\w$])${name.replace(/[$.]/g, "\\$&")}(?![\\w$])`);
  return lines.some((l, i) => i !== index && token.test(l) && writesKey(l));
}

/** Installer definitions (Inno Setup, WiX, NSIS): run keys and hidden PowerShell are what installers do. */
const INSTALLER_PATHS = ["*.iss", "*.wxs", "*.wxi", "*.nsi", "*.nsh"];

const WINDOWS_LOLBINS: Rule = {
  ...LOLBIN_PATTERNS,
  *scanText(file: TextFile, ctx): Iterable<Hit> {
    const installer = pathMatches(file.path, INSTALLER_PATHS);
    const installerNote = note("installerScript");
    const seen = new Set<number>();
    for (const hit of LOLBIN_PATTERNS.scanText!(file, ctx)) {
      seen.add(hit.line);
      yield installer ? { ...hit, weight: 5, ...installerNote } : hit;
    }
    // A .reg file is applied as a whole when someone imports it.
    const regFile = extension(file.path) === ".reg";
    let lines: string[] | null = null;
    for (const { line, text } of iterScanLines(file.content)) {
      if (seen.has(line)) continue;
      const m = RUN_KEY.exec(text);
      if (!m) continue;
      seen.add(line);
      if (installer) {
        yield { line, text, column: m.index, weight: 5, ...installerNote };
        continue;
      }
      lines ??= splitLines(file.content);
      yield regFile || writesRunKey(lines, line - 1)
        ? { line, text, column: m.index, ...note("runKeyWrite") }
        : { line, text, column: m.index, weight: 10, ...note("runKeyName") };
    }
  },
};

const DATA_EXTENSIONS = new Set(
  (
    ".md .txt .log .csv .json .png .jpg .jpeg .gif .bmp .ico .svg .webp .dat .bin .db .wav " +
    ".mp3 .mp4 .ttf .woff .woff2 .otf .pdf .zip .lock .cfg .ini .yml .yaml .xml .html .css"
  ).split(" "),
);

const EXEC_FILE_PATTERNS: readonly RegExp[] = [
  // Python: exec(open("x").read()), exec(compile(open("x").read(), ...)), exec(Path("x").read_text())
  /\b(?:exec|eval)\s*\(\s*(?:compile\s*\(\s*)?(?:open|(?:pathlib\.)?Path)\s*\(\s*(?:(["'])([^"'\n]{1,200})\1)?[^\n]{0,150}?\)\s*\.\s*(?:read|read_text|read_bytes)\s*\(/,
  // JavaScript: eval(fs.readFileSync("x")), the Function constructor, vm.runInThisContext(...)
  /\b(?:eval|Function|runInThisContext|runInNewContext)\s*\(\s*(?:\w+\.)?readFileSync\s*\(\s*(?:(["'`])([^"'`\n]{1,200})\1)?/,
];

const EXEC_FILE: Rule = {
  id: "GR-CODE-008",
  title: "Executes the contents of a file",
  category: "code",
  weight: 10,
  docWeight: 3,
  why:
    "Code reads another file and runs it. Reading a version file this way is an old Python " +
    "habit, but running a Markdown, text or image file means the real payload is hidden " +
    "somewhere reviewers and scanners treat as harmless data.",
  *scanText(file: TextFile): Iterable<Hit> {
    for (const { line, text } of iterScanLines(file.content)) {
      for (const p of EXEC_FILE_PATTERNS) {
        const m = p.exec(text);
        if (!m) continue;
        const target = m[2];
        const hidden = target !== undefined && DATA_EXTENSIONS.has(extension(target));
        yield {
          line,
          text,
          column: m.index,
          weight: hidden ? 40 : undefined,
          ...(hidden ? note("execFileData", { ext: extension(target) }) : note("execFile")),
        };
        break;
      }
    }
  },
};

export const RULES: readonly Rule[] = [
  DECODE_EXEC,
  PIPE_TO_SHELL,
  BROWSER_CREDENTIALS,
  SSH_KEYS,
  CRYPTO_WALLETS,
  EXFIL_ENDPOINTS,
  WINDOWS_LOLBINS,
  EXEC_FILE,
];
