/**
 * Behavior chains: what a file does with sensitive data, not which words it
 * contains. The file is tokenized (lexer.ts), split into statements, and data
 * is followed from where it comes from (a browser password store, the
 * environment, a download, a decoded blob) through variables, function
 * parameters and return values to where it goes (the network, an interpreter).
 *
 * A chain is reported only when the data actually flows from a source to a
 * sink. Naming a browser file, or calling fetch, is not a behavior; reading the
 * file and sending what was read is. The analysis is deliberately coarse
 * (statement level, no types) and never runs anything.
 */

import { basename, extension, splitLines } from "../text";
import type { TextFile } from "../types";
import { type Lang, type Token, langOf, tokenize } from "./lexer";

export type StepKind =
  | "reads-browser"
  | "reads-wallet"
  | "reads-discord"
  | "reads-ssh"
  | "reads-messenger"
  | "reads-app"
  | "downloads"
  | "decrypts"
  | "decodes"
  | "sends"
  | "runs";

export const STEP_KINDS: readonly StepKind[] = [
  "reads-browser",
  "reads-wallet",
  "reads-discord",
  "reads-ssh",
  "reads-messenger",
  "reads-app",
  "downloads",
  "decrypts",
  "decodes",
  "sends",
  "runs",
];

export interface ChainStep {
  kind: StepKind;
  line: number;
}

export type Behavior = "steals-credentials" | "downloads-and-runs" | "decodes-and-runs";

export interface Chain {
  behavior: Behavior;
  /** In data-flow order; the last step is where the data leaves (sent or run). */
  steps: ChainStep[];
}

const STEP_PHRASE: Record<StepKind, string> = {
  "reads-browser": "reads a browser password or cookie store",
  "reads-wallet": "reads a cryptocurrency wallet",
  "reads-discord": "reads Discord tokens",
  "reads-ssh": "reads an SSH private key",
  "reads-messenger": "reads messenger session files",
  "reads-app": "reads saved application credentials",
  downloads: "downloads code from the network",
  decrypts: "decrypts it",
  decodes: "decodes a hidden blob",
  sends: "sends it over the network",
  runs: "runs it",
};

/** One English sentence describing a chain, for the finding note (the engine stays English). */
export function describeChain(chain: Chain): string {
  return chain.steps.map((s, i) => `${i === 0 ? "" : "then "}${STEP_PHRASE[s.kind]} (line ${s.line})`).join(", ");
}

type Label = "browser" | "wallet" | "discord" | "ssh" | "messenger" | "app" | "download" | "decoded" | "browserdir";
type Taint = Map<Label, ChainStep[]>;

const CREDENTIAL_LABELS: readonly Label[] = ["browser", "wallet", "discord", "ssh", "messenger", "app"];

const SOURCE_STEP: Record<Exclude<Label, "browserdir">, StepKind> = {
  browser: "reads-browser",
  wallet: "reads-wallet",
  discord: "reads-discord",
  ssh: "reads-ssh",
  messenger: "reads-messenger",
  app: "reads-app",
  download: "downloads",
  decoded: "decodes",
};

/** Longer chains keep their first and last steps. */
const MAX_STEPS = 6;
/** Taint is followed through this many passes, so functions defined after their callers still count. */
const PASSES = 3;

// --- Sensitive data, matched in a statement's strings (also joined with "/", for Path.Combine and os.path.join) ---

const BROWSER_STORE = /(?:^|[\\/])(?:Login Data(?: For Account)?|Web Data|Local State|logins\.json|key[34]\.db|cookies\.sqlite|signons\.sqlite)(?:$|[\\/])|os_crypt/i;
const BROWSER_DIR =
  /(?:Google[\\/]+Chrome|Microsoft[\\/]+Edge|BraveSoftware|Opera Software|Yandex[\\/]+YandexBrowser|Chromium|Vivaldi|Mozilla[\\/]+Firefox)(?:$|[\\/])/i;
/** "Cookies" alone is a common word; it counts next to a browser profile folder. */
const BROWSER_COOKIES = /(?:^|[\\/])(?:Network[\\/]+)?Cookies$/;
const WALLET =
  /wallet\.dat|exodus\.wallet|Electrum[\\/]+wallets|Ethereum[\\/]+keystore|atomic[\\/]+Local Storage|Coinomi[\\/]|Guarda[\\/]|nkbihfbeogaeaoehlefnkodbefgpgknn|bfnaelmomeimhlpmgjnjophhpkkoljpa|hnfanknocfeofbddgcijnmhnfnkdnaad|egjidjbpglichdcondbcbdnbeeppgdph|fhbohimaelbohpjbbldcngcnapndodjp/i;
/** Discord's token store, or the prefix of its encrypted tokens. (A token regex alone is what secret scanners use too.) */
const DISCORD = /discord(?:canary|ptb)?[\\/]+Local Storage|dQw4w9WgXcQ:/i;
const SSH_KEY = /\.ssh[\\/]+id_(?:rsa|dsa|ecdsa|ed25519)(?:_sk)?(?:$|[^.\w])/;
const MESSENGER = /Telegram Desktop[\\/]+tdata|(?:^|[\\/])tdata$/i;
const APP_SECRETS = /FileZilla[\\/]+(?:recentservers|sitemanager)\.xml|(?:^|[\\/])loginusers\.vdf$|(?:^|[\\/])ssfn\w*$/i;

/** Decoded payloads and remote content run as code (not as a process: installers start programs they download). */
const EVAL: Record<Lang, RegExp> = {
  js: /(?<![\w$.])eval\(|(?<![\w$.])(?:new )?Function\(|\bvm\.(?:runIn\w*Context|compileFunction)\(|\bnew (?:vm\.)?Script\(/,
  python: /(?<![\w.])(?:exec|eval|compile)\(/,
  clike: /\bAssembly\.Load(?:From|File)?\(|\bCompileAssemblyFromSource\(|\bCSharpScript\.\w+\(|\bScriptEngine\w*\.eval\(/,
  powershell: /\b(?:invoke-expression|iex)\b|\[scriptblock\]::create\(|\.invokescript\(/,
};
/** The CommonJS/AMD module factory (a Function constructor given 'module','exports','require' and the source): how loaders run module code, not an exec sink. */
const MODULE_FACTORY = /\b(?:module|exports|require|__webpack|define)\b/;

const NETWORK: Record<Lang, RegExp> = {
  js: /(?<![\w$.])fetch\(|\baxios(?:\.\w+)?\(|(?<![\w$.])got(?:\.\w+)?\(|\bneedle(?:\.\w+)?\(|\bsuperagent\b|(?<![\w$.])request(?:\.(?:get|post|put|patch))?\(|\bhttps?\.(?:get|request)\(|\bXMLHttpRequest\b|\bsendBeacon\(|\bnet\.(?:connect|createConnection)\(|\btls\.connect\(|\bnew WebSocket\(|\$\.(?:ajax|get|post|getJSON)\(/,
  python:
    /\b(?:requests|httpx|urllib3)\.(?:get|post|put|patch|request|Session|Client|PoolManager)\(|\baiohttp\.ClientSession\(|\burlopen\(|\burlretrieve\(|\burllib\.request\.Request\(|\bHTTPS?Connection\(|\bsmtplib\.SMTP(?:_SSL)?\(|\bftplib\.FTP(?:_TLS)?\(|\bsocket\.(?:socket|create_connection)\(|\bDiscordWebhook\(|\bpycurl\.Curl\(/,
  clike:
    /\b(?:WebClient|HttpClient|HttpWebRequest|TcpClient|UdpClient|SmtpClient|FtpWebRequest|RestClient|ClientWebSocket|HttpURLConnection|OkHttpClient)\b|\.(?:UploadString|UploadData|UploadFile|UploadValues|DownloadString|DownloadData|DownloadFile|OpenRead|GetStringAsync|GetByteArrayAsync|GetStreamAsync|PostAsync|PutAsync|SendAsync|PostAsJsonAsync)\(|\bWebRequest\.Create\(|\bhttp\.(?:Get|Post|PostForm|NewRequest)\(|\bnet\.Dial\(/,
  powershell:
    /\b(?:invoke-webrequest|iwr|invoke-restmethod|irm|send-mailmessage|start-bitstransfer)\b|net\.webclient|\.(?:uploadstring|uploadfile|uploaddata|uploadvalues|downloadstring|downloaddata|downloadfile|openread)\(|system\.net\.(?:http\.httpclient|sockets)/,
};

/** Methods that send through an object a network call created ("req.write(data)", "s.post(...)"). */
const NET_OBJECT_SEND = /^[\w$]+\.(?:write|end|send|sendall|sendmail|send_message|storbinary|post|put|request|Send|Write|SendAsync|PostAsync|UploadString|UploadData|UploadFile|uploadstring|uploadfile)\(/;
/** Chat webhooks used as drop boxes by stealers. */
const EXFIL_ENDPOINT = /discord(?:app)?\.com\/api\/webhooks|api\.telegram\.org\/bot/i;

const DECODE: Record<Lang, RegExp> = {
  js: /\batob\(|\bString\.fromCharCode\(|\bzlib\.(?:inflate|inflateSync|gunzip|gunzipSync|unzip|unzipSync|inflateRaw\w*|brotliDecompress\w*)\(/,
  python:
    /\b(?:b64decode|b32decode|b85decode|a85decode|urlsafe_b64decode|decodebytes|unhexlify|fromhex|decompress)\(|\bmarshal\.loads\(|\bcodecs\.decode\(/,
  clike: /\bConvert\.FromBase64String\(|\bnew GZipStream\(|\bnew DeflateStream\(|\bBase64\.getDecoder\(\)|\bbase64\.StdEncoding\.DecodeString\(/,
  powershell: /\[(?:system\.)?convert\]::frombase64string\(|io\.compression\.(?:gzipstream|deflatestream)/,
};
/** Buffer.from(x, "base64") and buf.toString("hex"): the encoding is a string argument. */
const JS_BUFFER_DECODE = /\bBuffer\.from\(|\.toString\(""\)/;
const ENCODING_NAME = /^(?:base64|base64url|hex)$/i;

const DECRYPT = /\bCryptUnprotectData\b|\bProtectedData\.Unprotect\(|\bwin32crypt\b|\bAESGCM\(|\bcreateDecipheriv\(|\bAES\.new\(|\.decrypt\(|\bunprotectdata\b/i;


const KEYWORDS = new Set(
  (
    "if else for while do switch case break continue return function var let const new delete typeof instanceof void in of " +
    "try catch finally throw class extends super this import export from default async await yield static public private " +
    "protected internal readonly abstract override virtual sealed using namespace struct interface enum record get set " +
    "true false null undefined nil None True False def lambda pass global nonlocal with as assert del elif except raise " +
    "is not and or print foreach param begin process end out ref params string int bool object byte char long double float " +
    "func go defer chan type package select fallthrough goto"
  ).split(" "),
);

/** Calls that change the object they are called on: "data.append(pw)" makes data carry pw. */
const MUTATORS = new Set(
  "append extend push unshift add insert update put set setdefault writestr write Add AddRange Append AppendLine Insert Put Write WriteLine Push".split(" "),
);
/** Names that are modules or global objects, never data. */
const GLOBALS = new Set(
  "console process document window globalThis os sys fs path Math JSON Object Array String Number Promise logger log logging Console File Directory Path System Environment Registry".split(
    " ",
  ),
);

const ASSIGN = new Set(["=", "+=", "-=", "*=", "/=", "%=", "|=", "&=", "^=", "||=", "&&=", "??=", ":=", "<<=", ">>=", ">>>=", "**="]);

interface Frame {
  id: number;
  name: string | null;
  params: string[];
  parent: Frame | null;
  /** Python: indentation of the def/class line. */
  indent: number;
  fn: boolean;
}

interface Stmt {
  toks: Token[];
  line: number;
  col: number;
  /** Tokens joined compactly, strings as "" and regexes as //. */
  code: string;
  /** Token index for each character of code. */
  tokAt: number[];
  strs: string[];
  /** Innermost enclosing function frame (null at module level). */
  frame: Frame | null;
  /** The block this statement is the header of ("function f(a) {", "def f(a):"). */
  opens: Frame | null;
}

interface Facts {
  sources: { label: Label; line: number }[];
  decode: number | null;
  decrypt: number | null;
  network: number | null;
  evalSink: number | null;
}

interface Use {
  name: string;
  /** The whole value is used, not a member of it ("env" rather than "env.HOME"). */
  whole: boolean;
}

// --- Statements ---

function isWord(t: Token): boolean {
  return t.kind === "id" || t.kind === "num" || t.kind === "str" || t.kind === "re";
}

function makeStmt(toks: Token[], frame: Frame | null, opens: Frame | null): Stmt {
  let code = "";
  const tokAt: number[] = [];
  const strs: string[] = [];
  toks.forEach((t, i) => {
    const piece = t.kind === "str" ? '""' : t.kind === "re" ? "//" : t.kind === "num" ? "0" : t.value;
    if (t.kind === "str") strs.push(t.value);
    if (i > 0 && isWord(toks[i - 1]) && isWord(t)) {
      code += " ";
      tokAt.push(i);
    }
    code += piece;
    for (let k = 0; k < piece.length; k++) tokAt.push(i);
  });
  return { toks, line: toks[0].line, col: toks[0].col, code, tokAt, strs, frame, opens };
}

const CONTROL = new Set(["if", "for", "while", "switch", "catch", "foreach", "using", "lock", "fixed", "with", "elif", "return", "typeof", "sizeof", "nameof"]);
const BLOCK_KEYWORDS = new Set(["else", "try", "finally", "do", "get", "set", "init", "add", "remove", "unsafe", "checked", "unchecked", "static"]);
const TYPE_DECL = new Set(["class", "interface", "struct", "enum", "namespace", "record", "object", "impl", "trait", "module"]);
const BLOCK_STARTERS = new Set(["if", "for", "while", "switch", "select", "else", "func", "foreach", "using", "lock", "fixed", "catch", "try", "do", "finally"]);

function matchingOpen(toks: Token[], close: number): number {
  const closer = toks[close].value;
  const opener = closer === ")" ? "(" : closer === "]" ? "[" : "{";
  let depth = 0;
  for (let k = close; k >= 0; k--) {
    if (toks[k].kind !== "op") continue;
    if (toks[k].value === closer) depth++;
    else if (toks[k].value === opener && --depth === 0) return k;
  }
  return -1;
}

/** Parameter names inside the parentheses that end at index close. */
function paramNames(toks: Token[], open: number, close: number): string[] {
  const names: string[] = [];
  let segment: Token[] = [];
  let depth = 0;
  const flush = () => {
    const colon = segment.findIndex((t) => t.kind === "op" && t.value === ":");
    const eq = segment.findIndex((t) => t.kind === "op" && t.value === "=");
    const head = segment.slice(0, colon >= 0 ? colon : eq >= 0 ? eq : segment.length);
    const ids = head.filter((t) => t.kind === "id" && !KEYWORDS.has(t.value));
    // TypeScript/Python annotations put the name first ("a: string"); C-like types put it last ("string a").
    const name = colon >= 0 ? ids[0] : ids[ids.length - 1];
    if (name) names.push(name.value);
    segment = [];
  };
  for (let k = open + 1; k < close; k++) {
    const t = toks[k];
    if (t.kind === "op" && (t.value === "(" || t.value === "[" || t.value === "{" || t.value === "<")) depth++;
    if (t.kind === "op" && (t.value === ")" || t.value === "]" || t.value === "}" || t.value === ">")) depth--;
    if (depth === 0 && t.kind === "op" && t.value === ",") flush();
    else segment.push(t);
  }
  flush();
  return names;
}

let frameIds = 0;

/** The frame a "{" opens, from the tokens before it. */
function headerFrame(cur: Token[], lang: Lang, parent: Frame | null): Frame {
  const frame: Frame = { id: ++frameIds, name: null, params: [], parent, indent: -1, fn: false };
  const last = cur[cur.length - 1];
  if (!last) return frame;
  if (lang === "powershell") {
    const fnAt = cur.findIndex((t) => t.value === "function" || t.value === "filter");
    if (fnAt >= 0) {
      frame.fn = true;
      frame.name = cur[fnAt + 1]?.value ?? null;
      const open = cur.findIndex((t, k) => k > fnAt && t.value === "(");
      if (open >= 0 && last.value === ")") frame.params = paramNames(cur, open, cur.length - 1);
      return frame;
    }
    // A script block fed by a pipeline or a loop receives each item as $_.
    if (cur.some((t) => t.value === "|" || t.value === "foreach-object" || t.value === "%" || t.value === "where-object" || t.value === "?")) {
      frame.fn = true;
      frame.params = ["$_", "$psitem"];
    }
    return frame;
  }
  if (last.kind === "op" && (last.value === "=>" || last.value === "->")) {
    frame.fn = true;
    const before = cur[cur.length - 2];
    if (before?.kind === "op" && before.value === ")") {
      const open = matchingOpen(cur, cur.length - 2);
      if (open >= 0) frame.params = paramNames(cur, open, cur.length - 2);
      frame.name = assignedName(cur, open);
    } else if (before?.kind === "id") {
      frame.params = [before.value];
      frame.name = assignedName(cur, cur.length - 2);
    }
    return frame;
  }
  if (last.kind === "op" && last.value === ")") {
    const open = matchingOpen(cur, cur.length - 1);
    if (open <= 0) return frame;
    const nameTok = cur[open - 1];
    const fnKeyword = cur.findIndex((t) => t.kind === "id" && (t.value === "function" || t.value === "func"));
    if (fnKeyword >= 0 || (nameTok.kind === "id" && !CONTROL.has(nameTok.value))) {
      // "if (x) {", "for (...) {" are blocks, not functions.
      if (cur[0].kind === "id" && CONTROL.has(cur[0].value) && fnKeyword < 0) return frame;
      frame.fn = true;
      frame.params = paramNames(cur, open, cur.length - 1);
      frame.name = nameTok.kind === "id" && nameTok.value !== "function" ? nameTok.value : assignedName(cur, fnKeyword);
    }
  }
  return frame;
}

/** "steal = function (...)", "steal: (...) =>", "const steal = async (...) =>": the name before "=" or ":". */
function assignedName(cur: Token[], before: number): string | null {
  for (let k = before - 1; k > 0; k--) {
    const t = cur[k];
    if (t.kind === "op" && (t.value === "=" || t.value === ":")) {
      const name = cur[k - 1];
      return name?.kind === "id" ? name.value : null;
    }
    if (t.kind === "op" && (t.value === "(" || t.value === "," || t.value === ";")) return null;
  }
  return null;
}

function isBlockBrace(cur: Token[], lang: Lang): boolean {
  const last = cur[cur.length - 1];
  if (!last) return true;
  if (lang === "powershell") return !(last.kind === "op" && last.value === "@");
  if (last.kind === "op") return last.value === ")" || last.value === "=>" || last.value === "->";
  if (last.kind === "id" && BLOCK_KEYWORDS.has(last.value)) return true;
  if (cur.some((t) => t.kind === "id" && TYPE_DECL.has(t.value))) return true;
  return cur[0].kind === "id" && BLOCK_STARTERS.has(cur[0].value);
}

const CONTINUE_AFTER = new Set([")", "]", "}"]);
const CONTINUE_BEFORE = new Set(["{", ".", "?.", "+", "*", "/", "&&", "||", "??", "?", ":", "=", "==", "===", "!=", "!==", "|", "&", ">", "<", ">=", "<=", "=>", ","]);

function continuesAfterNewline(cur: Token[], tokens: Token[], i: number): boolean {
  const prev = cur[cur.length - 1];
  if (prev.kind === "op" && !CONTINUE_AFTER.has(prev.value)) return true;
  for (let k = i + 1; k < tokens.length; k++) {
    if (tokens[k].kind === "nl") continue;
    return tokens[k].kind === "op" && CONTINUE_BEFORE.has(tokens[k].value);
  }
  return false;
}

function nearestFunction(stack: Frame[]): Frame | null {
  for (let k = stack.length - 1; k >= 0; k--) if (stack[k].fn) return stack[k];
  return null;
}

function splitBraced(tokens: Token[], lang: Lang): Stmt[] {
  const stmts: Stmt[] = [];
  const frames: Frame[] = [];
  const blocks: boolean[] = [];
  const savedDepth: number[] = [];
  let cur: Token[] = [];
  let depth = 0;
  const flush = (opens: Frame | null) => {
    if (cur.length) stmts.push(makeStmt(cur, nearestFunction(frames), opens));
    cur = [];
  };
  tokens.forEach((t, i) => {
    if (t.kind === "nl") {
      if (depth === 0 && cur.length && !continuesAfterNewline(cur, tokens, i)) flush(null);
      return;
    }
    if (t.kind === "op") {
      if (t.value === ";" && depth === 0) return flush(null);
      if (t.value === "(" || t.value === "[") depth++;
      else if (t.value === ")" || t.value === "]") depth = Math.max(0, depth - 1);
      else if (t.value === "{") {
        if (isBlockBrace(cur, lang)) {
          const frame = headerFrame(cur, lang, nearestFunction(frames));
          flush(frame);
          frames.push(frame);
          blocks.push(true);
          savedDepth.push(depth);
          depth = 0;
          return;
        }
        blocks.push(false);
        depth++;
      } else if (t.value === "}") {
        if (blocks.pop()) {
          flush(null);
          frames.pop();
          depth = savedDepth.pop() ?? 0;
          return;
        }
        depth = Math.max(0, depth - 1);
      }
    }
    cur.push(t);
  });
  flush(null);
  return stmts;
}

function splitPython(tokens: Token[]): Stmt[] {
  const stmts: Stmt[] = [];
  const frames: Frame[] = [];
  let cur: Token[] = [];
  let depth = 0;
  const flush = () => {
    if (!cur.length) return;
    const col = cur[0].col;
    while (frames.length && frames[frames.length - 1].indent >= col) frames.pop();
    let opens: Frame | null = null;
    const head = cur[0].value === "async" ? cur[1] : cur[0];
    if (head?.kind === "id" && (head.value === "def" || head.value === "class")) {
      const at = cur.indexOf(head);
      opens = { id: ++frameIds, name: cur[at + 1]?.value ?? null, params: [], parent: nearestFunction(frames), indent: col, fn: head.value === "def" };
      const open = cur.findIndex((t, k) => k > at && t.value === "(");
      const close = open >= 0 ? closingParen(cur, open) : -1;
      if (head.value === "def" && open >= 0 && close > open) opens.params = paramNames(cur, open, close);
    }
    stmts.push(makeStmt(cur, nearestFunction(frames), opens));
    if (opens) frames.push(opens);
    cur = [];
  };
  for (const t of tokens) {
    if (t.kind === "nl") {
      if (depth === 0) flush();
      continue;
    }
    if (t.kind === "op") {
      if (t.value === ";" && depth === 0) {
        flush();
        continue;
      }
      if (t.value === "(" || t.value === "[" || t.value === "{") depth++;
      else if (t.value === ")" || t.value === "]" || t.value === "}") depth = Math.max(0, depth - 1);
    }
    cur.push(t);
  }
  flush();
  return stmts;
}

function closingParen(toks: Token[], open: number): number {
  let depth = 0;
  for (let k = open; k < toks.length; k++) {
    if (toks[k].kind !== "op") continue;
    if (toks[k].value === "(") depth++;
    else if (toks[k].value === ")" && --depth === 0) return k;
  }
  return -1;
}

// --- Defs and uses ---

function usesOf(s: Stmt, lang: Lang): Use[] {
  const uses: Use[] = [];
  const t = s.toks;
  let depth = 0;
  for (let k = 0; k < t.length; k++) {
    const tok = t[k];
    if (tok.kind === "op") {
      if (tok.value === "(" || tok.value === "[" || tok.value === "{") depth++;
      else if (tok.value === ")" || tok.value === "]" || tok.value === "}") depth--;
      continue;
    }
    if (tok.kind !== "id" || KEYWORDS.has(tok.value)) continue;
    const prev = t[k - 1];
    const next = t[k + 1];
    if (prev?.kind === "op" && (prev.value === "." || prev.value === "?." || prev.value === "::" || prev.value === "->")) continue;
    // Object keys ("{ body: x }") and Python keyword arguments ("f(data=x)") are names, not data.
    if (next?.kind === "op" && next.value === ":" && prev?.kind === "op" && (prev.value === "{" || prev.value === ",") && lang !== "python") continue;
    if (lang === "python" && depth > 0 && next?.kind === "op" && next.value === "=") continue;
    const member = next?.kind === "op" && (next.value === "." || next.value === "?." || next.value === "[");
    if ((tok.value === "this" || tok.value === "self") && next?.value === "." && t[k + 2]?.kind === "id") {
      const after = t[k + 3];
      uses.push({ name: `${tok.value}.${t[k + 2].value}`, whole: !(after?.kind === "op" && (after.value === "." || after.value === "[")) });
      continue;
    }
    uses.push({ name: tok.value, whole: !member });
  }
  return uses;
}

/** The variable an assignment target writes to: "a" for "a", "a.b.c", "a[i]". */
function rootBefore(t: Token[], op: number): string[] {
  let j = op - 1;
  const last = t[j];
  if (!last) return [];
  if (last.kind === "op" && (last.value === "}" || last.value === "]")) {
    const open = matchingOpen(t, j);
    // Destructuring: "const { a, b } =", "[a, b] =".
    if (open >= 0 && (open === 0 || t[open - 1].kind !== "id")) {
      return t.slice(open + 1, j).filter((x) => x.kind === "id" && !KEYWORDS.has(x.value)).map((x) => x.value);
    }
    if (open > 0) j = open - 1;
  }
  if (t[j]?.kind === "op" && t[j].value === ")") return [];
  while (j >= 2 && t[j]?.kind === "id" && t[j - 1]?.kind === "op" && (t[j - 1].value === "." || t[j - 1].value === "?.")) {
    const base = t[j - 2];
    const beforeBase = t[j - 3];
    if (base.kind === "id" && (base.value === "this" || base.value === "self") && !(beforeBase?.kind === "op" && beforeBase.value === ".")) {
      return [`${base.value}.${t[j].value}`];
    }
    j -= 2;
  }
  const root = t[j];
  return root?.kind === "id" && !KEYWORDS.has(root.value) ? [root.value] : [];
}

function defsOf(s: Stmt, lang: Lang, modules: Set<string>): string[] {
  const t = s.toks;
  const defs = new Set<string>();
  let depth = 0;
  let assigned = false;
  for (let k = 0; k < t.length; k++) {
    const tok = t[k];
    if (tok.kind === "op") {
      if (tok.value === "(" || tok.value === "[" || tok.value === "{") depth++;
      else if (tok.value === ")" || tok.value === "]" || tok.value === "}") depth--;
      else if (ASSIGN.has(tok.value) && (lang !== "python" || depth === 0 || tok.value === ":=")) {
        if (lang === "python" && depth === 0 && tok.value === "=") {
          // "a, b = x" assigns every name before "=".
          for (let j = 0; j < k; j++) if (t[j].kind === "id" && !KEYWORDS.has(t[j].value) && t[j - 1]?.value !== ".") defs.add(t[j].value);
        } else {
          for (const name of rootBefore(t, k)) defs.add(name);
        }
        if (depth === 0) assigned = true;
      }
    }
    if (tok.kind === "id") {
      // Loop variables take the collection's data; "with x as f", "out var x".
      if ((tok.value === "as" || tok.value === "out") && t[k + 1]?.kind === "id") {
        const next = t[k + 2]?.kind === "id" && tok.value === "out" ? t[k + 2] : t[k + 1];
        defs.add(next.value);
      }
    }
  }
  const first = t[0];
  if (first?.kind === "id" && (first.value === "for" || first.value === "foreach")) {
    const stop = t.findIndex((x, k) => k > 0 && ((x.kind === "id" && (x.value === "in" || x.value === "of")) || (x.kind === "op" && x.value === ":")));
    if (stop > 0) {
      const ids = t.slice(1, stop).filter((x) => x.kind === "id" && !KEYWORDS.has(x.value));
      for (const x of lang === "clike" ? ids.slice(-1) : ids) defs.add(x.value);
    }
  }
  // Inline callbacks receive the data the statement handles: "res.on('data', c => d += c)", "lambda c: ...".
  for (let k = 0; k < t.length; k++) {
    if (t[k].kind === "op" && t[k].value === "=>") {
      const before = t[k - 1];
      if (before?.kind === "id") defs.add(before.value);
      else if (before?.kind === "op" && before.value === ")") {
        const open = matchingOpen(t, k - 1);
        if (open >= 0) for (const p of paramNames(t, open, k - 1)) defs.add(p);
      }
    }
    if (lang === "python" && t[k].kind === "id" && t[k].value === "lambda") {
      for (let j = k + 1; j < t.length && t[j].value !== ":"; j++) if (t[j].kind === "id") defs.add(t[j].value);
    }
  }
  // "data.append(pw)": the receiver collects what is passed in.
  if (!assigned && first?.kind === "id" && !modules.has(first.value) && !GLOBALS.has(first.value)) {
    let k = 0;
    while (t[k + 1]?.kind === "op" && t[k + 1].value === "." && t[k + 2]?.kind === "id") k += 2;
    if (k > 0 && t[k + 1]?.kind === "op" && t[k + 1].value === "(" && MUTATORS.has(t[k].value)) defs.add(first.value);
  }
  // Anonymous blocks (callbacks, pipelines) receive the header's data as parameters.
  if (s.opens && s.opens.fn && !s.opens.name) for (const p of s.opens.params) defs.add(p);
  return [...defs];
}

function modulesOf(stmts: Stmt[]): Set<string> {
  const modules = new Set<string>();
  for (const s of stmts) {
    const t = s.toks;
    if (/\brequire\(|\bimport\(/.test(s.code) || t[0]?.value === "import" || t[0]?.value === "from" || t[0]?.value === "using") {
      for (const x of t) if (x.kind === "id" && !KEYWORDS.has(x.value)) modules.add(x.value);
    }
  }
  return modules;
}

// --- Facts ---

function lineAt(s: Stmt, index: number): number {
  return s.toks[s.tokAt[index] ?? 0]?.line ?? s.line;
}

function find(s: Stmt, re: RegExp): number | null {
  const m = re.exec(s.code);
  return m ? lineAt(s, m.index) : null;
}

function stringLine(s: Stmt, re: RegExp): number | null {
  for (const t of s.toks) if (t.kind === "str" && re.test(t.value)) return t.line;
  return re.test(s.strs.join("/")) ? s.line : null;
}

function factsOf(s: Stmt, lang: Lang, netObjects: ReadonlySet<string>, browserDirVars: ReadonlySet<string>, uses: Use[]): Facts {
  const sources: Facts["sources"] = [];
  const add = (label: Label, line: number | null) => {
    if (line !== null) sources.push({ label, line });
  };
  if (s.strs.length) {
    add("browser", stringLine(s, BROWSER_STORE));
    const dir = stringLine(s, BROWSER_DIR);
    if (dir !== null) add("browserdir", dir);
    if (dir !== null || uses.some((u) => browserDirVars.has(u.name))) add("browser", stringLine(s, BROWSER_COOKIES));
    add("wallet", stringLine(s, WALLET));
    add("discord", stringLine(s, DISCORD));
    add("ssh", stringLine(s, SSH_KEY));
    add("messenger", stringLine(s, MESSENGER));
    add("app", stringLine(s, APP_SECRETS));
  }
  if (lang !== "powershell" && /\bos_crypt\b/.test(s.code)) add("browser", find(s, /\bos_crypt\b/));

  let network = find(s, NETWORK[lang]);
  if (network === null && NET_OBJECT_SEND.test(s.code) && netObjects.has(s.toks[0].value)) network = s.line;
  if (network === null && s.code.includes("(")) {
    const endpoint = stringLine(s, EXFIL_ENDPOINT);
    if (endpoint !== null) network = endpoint;
  }
  if (network !== null) add("download", network);

  let decode = find(s, DECODE[lang]);
  if (decode === null && lang === "js" && JS_BUFFER_DECODE.test(s.code) && s.strs.some((x) => ENCODING_NAME.test(x))) decode = find(s, JS_BUFFER_DECODE);
  // A module factory (a Function constructor given 'module','exports','require') runs module code; it is how loaders work, not a hidden-payload sink.
  const evalSink = lang === "js" && s.strs.some((x) => MODULE_FACTORY.test(x)) ? null : find(s, EVAL[lang]);
  return { sources, decode, decrypt: find(s, DECRYPT), network, evalSink };
}

// --- Taint ---

function withStep(steps: ChainStep[], step: ChainStep): ChainStep[] {
  const last = steps[steps.length - 1];
  if (last && last.kind === step.kind && last.line === step.line) return steps;
  const next = [...steps, step];
  return next.length > MAX_STEPS ? [next[0], ...next.slice(next.length - MAX_STEPS + 1)] : next;
}

function merge(into: Taint, from: Taint): boolean {
  let changed = false;
  for (const [label, steps] of from) {
    const have = into.get(label);
    if (!have || steps.length < have.length) {
      into.set(label, steps);
      changed = changed || !have;
    }
  }
  return changed;
}

class Scopes {
  private readonly vars = new Map<number, Map<string, Taint>>();

  private scope(frame: Frame | null): Map<string, Taint> {
    const id = frame?.id ?? 0;
    let m = this.vars.get(id);
    if (!m) this.vars.set(id, (m = new Map()));
    return m;
  }

  get(name: string, frame: Frame | null): Taint | undefined {
    for (let f: Frame | null = frame; ; f = f.parent) {
      const t = this.vars.get(f?.id ?? 0)?.get(name);
      if (t) return t;
      if (!f) return undefined;
    }
  }

  /**
   * Writes to the nearest scope that already has the name (a closure variable),
   * or the current one; `exact` writes to the given frame (function parameters).
   */
  set(name: string, frame: Frame | null, taint: Taint, exact = false): void {
    let target: Frame | null = frame;
    if (name.startsWith("this.") || name.startsWith("self.")) target = null;
    else if (!exact) {
      for (let f: Frame | null = frame; ; f = f.parent) {
        if (this.vars.get(f?.id ?? 0)?.has(name)) {
          target = f;
          break;
        }
        if (!f) break;
      }
    }
    const scope = this.scope(target);
    const have = scope.get(name) ?? new Map();
    merge(have, taint);
    scope.set(name, have);
  }
}

/** Above this size (or with very long lines) a file is generated or minified, not analyzed. */
const MAX_ANALYZED_BYTES = 1_000_000;

function minified(content: string): boolean {
  const lines = content.length / (content.split("\n", 2000).length || 1);
  return content.length > 20_000 && lines > 400;
}

export function analyzeFile(file: TextFile): Chain[] {
  const lang = langOf(file.path);
  if (!lang || file.content.length > MAX_ANALYZED_BYTES) return [];
  if (/\.min\.[cm]?js$/i.test(basename(file.path)) || (extension(file.path) !== ".py" && minified(file.content))) return [];
  const tokens = tokenize(file.content, lang);
  if (!tokens) return [];
  frameIds = 0;
  const stmts = lang === "python" ? splitPython(tokens) : splitBraced(tokens, lang);
  const modules = modulesOf(stmts);
  const uses = stmts.map((s) => usesOf(s, lang));
  const defs = stmts.map((s) => defsOf(s, lang, modules));

  // Named functions, by name: call sites pass their data to the parameters.
  const functions = new Map<string, Frame[]>();
  for (const s of stmts) {
    if (s.opens?.fn && s.opens.name) functions.set(s.opens.name, [...(functions.get(s.opens.name) ?? []), s.opens]);
  }
  // Objects a network call created, and variables holding a browser profile folder.
  const netObjects = new Set<string>();
  const browserDirVars = new Set<string>();
  let facts = stmts.map((s, i) => factsOf(s, lang, netObjects, browserDirVars, uses[i]));
  stmts.forEach((_, i) => {
    if (facts[i].network !== null) for (const d of defs[i]) netObjects.add(d);
    if (facts[i].sources.some((x) => x.label === "browserdir")) for (const d of defs[i]) browserDirVars.add(d);
  });
  if (netObjects.size || browserDirVars.size) facts = stmts.map((s, i) => factsOf(s, lang, netObjects, browserDirVars, uses[i]));

  const scopes = new Scopes();
  const chains = new Map<string, Chain>();
  const report = (behavior: Behavior, steps: ChainStep[]) => {
    const sink = steps[steps.length - 1];
    const key = `${behavior}:${sink.line}`;
    if (!chains.has(key)) chains.set(key, { behavior, steps });
  };

  for (let pass = 0; pass < PASSES; pass++) {
    stmts.forEach((s, i) => {
      const f = facts[i];
      const incoming: Taint = new Map();
      for (const src of f.sources) {
        const steps = src.label === "browserdir" ? [] : [{ kind: SOURCE_STEP[src.label], line: src.line }];
        merge(incoming, new Map([[src.label, steps]]));
      }
      for (const u of uses[i]) {
        const t = scopes.get(u.name, s.frame);
        if (!t) continue;
        for (const [label, steps] of t) merge(incoming, new Map([[label, steps]]));
      }
      // A decode produces tainted data on its own (an opaque blob becomes code), like a source.
      if (f.decode !== null && !incoming.has("decoded")) incoming.set("decoded", [{ kind: "decodes", line: f.decode }]);
      if (!incoming.size) return;

      if (f.decrypt !== null) for (const [label, steps] of incoming) incoming.set(label, withStep(steps, { kind: "decrypts", line: f.decrypt }));
      if (f.decode !== null) for (const [label, steps] of incoming) if (label !== "decoded") incoming.set(label, withStep(steps, { kind: "decodes", line: f.decode }));

      if (f.network !== null) {
        for (const label of CREDENTIAL_LABELS) {
          const steps = incoming.get(label);
          if (steps?.length) {
            report("steals-credentials", withStep(steps, { kind: "sends", line: f.network }));
            break;
          }
        }
      }
      if (f.evalSink !== null) {
        const download = incoming.get("download");
        const decoded = incoming.get("decoded");
        if (download?.length) report("downloads-and-runs", withStep(download, { kind: "runs", line: f.evalSink }));
        else if (decoded?.length && decoded[0].line !== f.evalSink) report("decodes-and-runs", withStep(decoded, { kind: "runs", line: f.evalSink }));
      }

      // The data flows on: into assigned names, into called functions' parameters, out of returns.
      for (const d of defs[i]) scopes.set(d, s.frame, incoming);
      for (const k of s.toks.keys()) {
        const tok = s.toks[k];
        if (tok.kind !== "id") continue;
        const callee = functions.get(tok.value);
        if (!callee) continue;
        const called = s.toks[k + 1]?.value === "(" || lang === "powershell";
        if (!called || s.opens?.name === tok.value) continue;
        for (const fn of callee) for (const p of fn.params) scopes.set(p, fn, incoming, true);
      }
      const first = s.toks[0];
      if (s.frame?.name && first.kind === "id" && (first.value === "return" || first.value === "yield")) {
        scopes.set(s.frame.name, s.frame.parent, incoming);
        scopes.set(`this.${s.frame.name}`, null, incoming);
        scopes.set(`self.${s.frame.name}`, null, incoming);
      }
    });
  }
  return [...chains.values()];
}

/** Lines of the file, for snippets of each chain step. */
export function fileLines(file: TextFile): string[] {
  return splitLines(file.content);
}
