/** GR-CODE-*: dangerous code patterns. Down-weighted inside documentation files. */

import { extension, iterScanLines } from "../text";
import type { TextFile } from "../types";
import { type Hit, type Rule, regexRule } from "./base";
import { PIPE_TO_SHELL_PATTERNS, WORKFLOW_PATHS } from "./autorun";

const PIPE = String.raw`(?<!\|)\|(?!\|)`;
const SHELL = String.raw`(?:sudo\s+)?(?:(?:/usr(?:/local)?)?/bin/)?(?:ba|z|da|k)?sh\b`;

const DECODE_EXEC = regexRule({
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
    // JavaScript: eval/Function of decoded data.
    /\beval\s*\(\s*(?:atob|unescape|decodeURIComponent)\s*\(/,
    /\beval\s*\(\s*Buffer\.from\s*\(.{0,200}?['"](?:base64|hex)['"]/,
    /\b(?:new\s+)?Function\s*\(\s*(?:atob\s*\(|Buffer\.from\s*\()/,
    /\beval\s*\(\s*String\.fromCharCode\s*\(/,
    // Shell: base64 -d piped into a shell.
    new RegExp(String.raw`\bbase64\s+(?:-d|--decode|-D)\b[^|\n]{0,80}` + PIPE + String.raw`\s*` + SHELL),
    // PowerShell: encoded command or IEX of a base64 payload.
    /\b(?:powershell|pwsh)(?:\.exe)?\b.{0,80}?\s-e(?:nc(?:odedcommand)?)?\s+[A-Za-z0-9+/=]{16,}/i,
    /\b(?:iex|invoke-expression)\b.{0,120}?frombase64string/i,
    new RegExp(String.raw`frombase64string.{0,200}?` + PIPE + String.raw`\s*(?:iex|invoke-expression)\b`, "i"),
  ],
});

const PIPE_TO_SHELL = regexRule({
  id: "GR-CODE-002",
  title: "Downloads a script and pipes it into a shell",
  category: "code",
  weight: 35,
  // "curl ... | sh" is a common, legitimate install line in READMEs.
  docWeight: 0,
  // Workflows run on GitHub's servers: see GR-CI-001.
  exclude: WORKFLOW_PATHS,
  why:
    "A remote script is downloaded and executed immediately, without being saved or " +
    "reviewed. Whoever controls that URL controls your machine.",
  patterns: PIPE_TO_SHELL_PATTERNS,
});

const BROWSER_CREDENTIALS = regexRule({
  id: "GR-CODE-003",
  title: "Reads browser password or cookie stores",
  category: "code",
  weight: 40,
  docWeight: 5,
  why:
    "References the files where browsers keep saved passwords, cookies and the keys that " +
    "decrypt them. Info-stealer malware goes after exactly these files.",
  patterns: [
    /["'\\/]Login Data\b/,
    /\blogins\.json\b/,
    /\bkey[34]\.db\b/,
    /\bcookies\.sqlite\b/,
    /\bCryptUnprotectData\b/,
    // "encrypted_key" alone is a standard JWE field; Chrome's os_crypt key is the indicator.
    /Local State.{0,200}?os_crypt/i,
    /os_crypt.{0,40}?encrypted_key/i,
    /(?:Google[\\/]+Chrome|BraveSoftware[\\/]+Brave-Browser|Microsoft[\\/]+Edge|Opera Software[\\/]+Opera (?:Stable|GX Stable)|Yandex[\\/]+YandexBrowser)[\\/]+(?:User Data|Default)/i,
    /Mozilla[\\/]+Firefox[\\/]+Profiles/i,
  ],
});

const SSH_KEYS = regexRule({
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

const WINDOWS_LOLBINS = regexRule({
  id: "GR-CODE-007",
  title: "Uses Windows tools to download, hide or persist",
  category: "code",
  weight: 35,
  docWeight: 5,
  why:
    "Built-in Windows programs (certutil, bitsadmin, mshta, rundll32, regsvr32) can download " +
    "and run payloads, and Defender exclusions, hidden PowerShell windows and Run keys are " +
    "how malware hides and survives a reboot. Normal projects almost never need these.",
  patterns: [
    /\bcertutil(?:\.exe)?\s[^\n]{0,60}-(?:urlcache|decode)\b/i,
    /\bbitsadmin(?:\.exe)?\s[^\n]{0,60}\/transfer\b/i,
    /\bmshta(?:\.exe)?\s+["']?(?:https?:|javascript:|vbscript:)/i,
    /\brundll32(?:\.exe)?\s[^\n]{0,80}javascript:/i,
    /\bregsvr32(?:\.exe)?\s[^\n]{0,80}\/i:\s*["']?https?:/i,
    /\bAdd-MpPreference\b[^\n]{0,60}-Exclusion(?:Path|Process|Extension)\b/i,
    /\bSet-MpPreference\b[^\n]{0,60}-Disable(?:RealtimeMonitoring|IOAVProtection|BehaviorMonitoring|ScriptScanning)\b/i,
    /\b(?:powershell|pwsh)(?:\.exe)?\b[^\n]{0,120}-(?:w|win|windowstyle)\s+hidden\b/i,
    /\\CurrentVersion\\Run(?:Once)?\b/i,
  ],
});

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
