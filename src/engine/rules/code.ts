/** GR-CODE-*: dangerous code patterns. Down-weighted inside documentation files. */

import { extension, iterScanLines, splitLines } from "../text";
import type { TextFile } from "../types";
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

const DECODE_EXEC: Rule = {
  ...DECODE_EXEC_PATTERNS,
  *scanText(file: TextFile, ctx): Iterable<Hit> {
    const strong = new Set<number>();
    for (const hit of DECODE_EXEC_PATTERNS.scanText!(file, ctx)) {
      strong.add(hit.line);
      yield hit;
    }
    for (const { line, text } of iterScanLines(file.content)) {
      if (strong.has(line)) continue;
      const m = EVAL_URL_DECODED.exec(text);
      if (m) yield { line, text, column: m.index, weight: 10, note: "evaluates URL-decoded data from a variable" };
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
    const container = pathMatches(file.path, CONTAINER_BUILD_PATHS);
    for (const hit of pipeToShellHits(file)) {
      yield container ? { ...hit, weight: 5, note: "runs inside a container image build, not directly on your computer" } : hit;
    }
  },
};

const BROWSER_STORES: readonly RegExp[] = [
  /["'\\/]Login Data\b/,
  /\blogins\.json\b/,
  /\bkey[34]\.db\b/,
  /\bcookies\.sqlite\b/,
  // "encrypted_key" alone is a standard JWE field; Chrome's os_crypt key is the indicator.
  /Local State.{0,200}?os_crypt/i,
  /os_crypt.{0,40}?encrypted_key/i,
  /(?:Google[\\/]+Chrome|BraveSoftware[\\/]+Brave-Browser|Microsoft[\\/]+Edge|Opera Software[\\/]+Opera (?:Stable|GX Stable)|Yandex[\\/]+YandexBrowser)[\\/]+(?:User Data|Default)/i,
  /Mozilla[\\/]+Firefox[\\/]+Profiles/i,
];
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
    // A file that deletes browser data and never opens, copies, decrypts or sends it is a cleaner.
    const cleaner = browserStore && DELETES.test(file.content) && !STEALS.test(file.content) && !NETWORK_SEND.test(file.content);
    for (const { line, text } of iterScanLines(file.content)) {
      const store = BROWSER_STORES.map((p) => p.exec(text)).find((m) => m !== null);
      if (store) {
        yield cleaner && !BROWSER_KEY.test(text)
          ? { line, text, column: store.index, weight: 10, note: "only deletes browser data here; nothing in this file opens, copies, decrypts or sends it (privacy cleaners do this)" }
          : { line, text, column: store.index };
        continue;
      }
      const dpapi = DPAPI.exec(text);
      if (dpapi) {
        yield browserStore
          ? { line, text, column: dpapi.index, note: "decrypts with Windows DPAPI next to browser password files" }
          : { line, text, column: dpapi.index, weight: 10, note: "decrypts with Windows DPAPI; no browser files referenced" };
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
    const sends = NETWORK_SEND.test(file.content);
    for (const hit of SSH_KEY_PATTERNS.scanText!(file, ctx)) {
      if (AUTHORIZED_KEYS.test(hit.text)) {
        yield hit;
        continue;
      }
      yield sends
        ? { ...hit, note: "the same file can send data over the network" }
        : { ...hit, weight: 15, note: "no network use in the same file (SSH tools read keys too)" };
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
/**
 * Writing to the registry: reg add, PowerShell, .NET, Win32, Python winreg, Go,
 * VBScript, Delphi, or opening a key for writing. Startup managers and cleaners
 * only read the Run keys; persistence writes to them.
 */
const REGISTRY_WRITE =
  /\breg(?:\.exe)?\s+(?:add|import)\b|\b(?:New|Set)-ItemProperty\b|\bSetValue(?:Ex)?\b|\bRegSetValue|\bRegSetKeyValue|\bSet(?:String|ExpandString|DWord|QWord|Binary|Strings)Value\b|\bRegWrite\b|\bWriteString\b|\bKEY_(?:SET_VALUE|WRITE|ALL_ACCESS)\b|\bOpenSubKey\s*\([^)\n]{0,200},\s*true\s*\)/i;
/** A write this many lines before or after the Run key counts as writing to it. */
const RUN_KEY_WRITE_LINES = 10;

/** Installer definitions (Inno Setup, WiX, NSIS): run keys and hidden PowerShell are what installers do. */
const INSTALLER_PATHS = ["*.iss", "*.wxs", "*.wxi", "*.nsi", "*.nsh"];

const WINDOWS_LOLBINS: Rule = {
  ...LOLBIN_PATTERNS,
  *scanText(file: TextFile, ctx): Iterable<Hit> {
    const installer = pathMatches(file.path, INSTALLER_PATHS);
    const installerNote = "installer script: runs only when someone builds and runs the installer";
    const seen = new Set<number>();
    for (const hit of LOLBIN_PATTERNS.scanText!(file, ctx)) {
      seen.add(hit.line);
      yield installer ? { ...hit, weight: 5, note: installerNote } : hit;
    }
    // A .reg file is applied as a whole when someone imports it.
    const regFile = extension(file.path) === ".reg";
    let writeLines: number[] | null = null;
    for (const { line, text } of iterScanLines(file.content)) {
      if (seen.has(line)) continue;
      const m = RUN_KEY.exec(text);
      if (!m) continue;
      seen.add(line);
      if (installer) {
        yield { line, text, column: m.index, weight: 5, note: installerNote };
        continue;
      }
      writeLines ??= splitLines(file.content).flatMap((l, i) => (REGISTRY_WRITE.test(l) ? [i + 1] : []));
      const writes = regFile || writeLines.some((w) => Math.abs(w - line) <= RUN_KEY_WRITE_LINES);
      yield writes
        ? { line, text, column: m.index, note: "writes to a Run key: starts a program at every logon" }
        : { line, text, column: m.index, weight: 10, note: "only names a Run key; no registry write nearby (startup managers and cleaners read these keys)" };
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
          note: hidden ? `runs code stored in a data file (${extension(target)})` : "runs code read from a file",
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
