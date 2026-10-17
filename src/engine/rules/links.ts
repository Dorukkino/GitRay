/**
 * GR-LINK-* and GR-SOC-*: the README side of repo malware. Fake projects
 * (cheats, cracks, "free" tools) rarely hide malware in their code: they send
 * visitors to an archive or executable somewhere else, often with a password
 * and a request to turn off the antivirus.
 */

import { basename, iterScanLines, splitLines } from "../text";
import type { RepoInfo, ScanContext, TextFile } from "../types";
import { note } from "../notes";
import type { Hit, Rule } from "./base";

export const DOC_PATTERNS = ["*.md", "*.markdown", "*.mdown", "*.rst", "*.adoc", "*.asciidoc", "*.txt", "README*"];

const RISKY_EXTENSIONS = [
  ".zip", ".rar", ".7z", ".iso", ".img",
  // Windows
  // (".com" is left out: it ends far more domain-like names, "github.com/org/site.com", than DOS programs.)
  ".exe", ".msi", ".msix", ".scr", ".bat", ".cmd", ".ps1", ".vbs", ".hta", ".lnk", ".pif",
  // macOS, Linux, Android
  ".dmg", ".pkg", ".appimage", ".apk",
  // Java (runs on any OS)
  ".jar",
];

const SHORTENERS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "ow.ly", "cutt.ly", "rb.gy", "shorturl.at",
  "rebrand.ly", "t.ly", "tiny.cc", "buff.ly", "v.gd", "s.id", "shorturl.gg", "tny.im", "lnkd.in",
  "adf.ly", "linkvertise.com", "link-to.net", "direct-link.net", "lootlabs.gg", "loot-link.com",
]);
/** Ad-gated "unlock the download" sites: every link to them is a gate, whatever its path. */
const AD_GATES = new Set(["adf.ly", "linkvertise.com", "link-to.net", "direct-link.net", "lootlabs.gg", "loot-link.com"]);

/** File-sharing sites: downloads without an extension in the URL, rarely scanned by anyone. */
const FILE_HOSTS = [
  "mediafire.com", "mega.nz", "mega.io", "mega.co.nz", "drive.google.com", "dropbox.com",
  "dl.dropboxusercontent.com", "onedrive.live.com", "1drv.ms", "gofile.io", "pixeldrain.com",
  "anonfiles.com", "catbox.moe", "transfer.sh", "sendspace.com", "workupload.com",
  "krakenfiles.com", "files.fm", "uploadhaven.com", "qiwi.gg", "filebin.net", "wetransfer.com",
  "we.tl", "4shared.com", "zippyshare.com", "uploadrar.com", "userscloud.com", "solidfiles.com",
  "upload.ee", "bowfile.com", "send.cm", "terabox.com", "rapidgator.net", "nitroflare.com",
  "file.io", "tmpfiles.org", "cdn.discordapp.com", "media.discordapp.net", "files.catbox.moe",
  "anonymfile.com", "filetransfer.io", "buzzheavier.com", "dbree.me",
];  // prettier-ignore

/**
 * Reserved example names (RFC 2606, RFC 6761) that documentation uses as placeholders.
 * ".invalid" stays in scope: nobody writes it in real docs, and our fixtures use it.
 */
function isPlaceholderHost(host: string): boolean {
  return /(?:^|\.)example\.(?:com|net|org)$/.test(host) || /(?:^|\.)(?:example|test|localhost)$/.test(host);
}

/** Pages about a package or topic whose name merely ends like a file ("lodash.zip", "Cmd.exe"). */
const PAGE_PATHS: readonly [string, RegExp][] = [
  ["npmjs.com", /^\/package\//],
  ["pypi.org", /^\/project\//],
  ["crates.io", /^\/crates\//],
  ["nuget.org", /^\/packages\//],
  ["rubygems.org", /^\/gems\//],
  ["wikipedia.org", /^\/wiki\//],
];

function isInfoPage(url: URL): boolean {
  return PAGE_PATHS.some(([host, path]) => hostMatches(url.hostname, [host]) && path.test(url.pathname));
}

// Braces end a URL: "{{https://mega.nz/...}}" is a placeholder in a command template.
const URL_RE = /https?:\/\/[^\s<>"'()[\]{}`]+/gi;
// Links without a scheme ("www.mediafire.com/file/..."), only to well-known hosts.
const BARE_RE = /(?<![\w@./-])(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s<>"'()[\]`]*/gi;
const PATH_ESCAPES = ["..", "%2e", "\\", "%5c", "%2f"];

function hostMatches(host: string, list: Iterable<string>): boolean {
  for (const h of list) if (host === h || host.endsWith(`.${h}`)) return true;
  return false;
}

interface Link {
  url: URL;
  index: number;
}

function* extractLinks(segment: string): Generator<Link> {
  const seen = new Set<number>();
  for (const m of segment.matchAll(URL_RE)) {
    const url = toUrl(m[0]);
    for (let i = m.index; i < m.index + m[0].length; i++) seen.add(i);
    if (url && !isPlaceholderHost(url.hostname)) yield { url, index: m.index };
  }
  for (const m of segment.matchAll(BARE_RE)) {
    if (seen.has(m.index)) continue;
    const url = toUrl(`https://${m[0]}`);
    if (url && (SHORTENERS.has(url.hostname) || hostMatches(url.hostname, FILE_HOSTS))) {
      yield { url, index: m.index };
    }
  }
}

function pathSegments(url: URL): string[] {
  return url.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });
}

function toUrl(raw: string): URL | null {
  try {
    return new URL(raw.replace(/[.,;:!?*_~]+$/, ""));
  } catch {
    return null;
  }
}

/** The repository's own GitHub release download or source archive of the scanned commit. */
function ownDownload(url: URL, info: RepoInfo | null): "release" | "archive" | "other-archive" | null {
  if (!info || (url.hostname !== "github.com" && url.hostname !== "www.github.com")) return null;
  const path = url.pathname.toLowerCase();
  const raw = url.href.toLowerCase();
  // Dot segments and (encoded) slashes let a browser resolve the link to another repository.
  if (PATH_ESCAPES.some((e) => raw.slice(url.origin.length).includes(e))) return null;
  const base = `/${info.fullName.toLowerCase()}/`;
  if (!path.startsWith(base)) return null;
  const rest = path.slice(base.length);
  if (rest.startsWith("releases/download/") || rest.startsWith("releases/latest/download/")) return "release";
  const archive = /^archive\/(?:refs\/heads\/)?(.+?)\.(?:zip|tar\.gz)$/.exec(rest);
  if (!archive) return null;
  const ref = archive[1];
  return ref === info.defaultBranch.toLowerCase() || ref === info.headSha ? "archive" : "other-archive";
}

function hasRiskyExtension(url: URL): boolean {
  const path = url.pathname.toLowerCase();
  return RISKY_EXTENSIONS.some((ext) => path.endsWith(ext)) && !isInfoPage(url);
}

const DOWNLOAD_LINK: Rule = {
  id: "GR-LINK-001",
  title: "Link to an executable or archive download",
  category: "links",
  weight: 20,
  appliesTo: DOC_PATTERNS,
  why:
    "Malware repositories send visitors to an archive or executable instead of letting them " +
    "build the code they can see. The repository's own release files and its source archive " +
    "are exempt; anything else, including other GitHub repositories, is not.",
  *scanText(file: TextFile, ctx: ScanContext): Iterable<Hit> {
    for (const { line, text } of iterScanLines(file.content)) {
      for (const { url, index } of extractLinks(text)) {
        if (!hasRiskyExtension(url)) continue;
        const own = ownDownload(url, ctx.info);
        if (own === "release" || own === "archive") continue;
        const note =
          own === "other-archive"
            ? "downloads a version of this repository that was not scanned (another branch or tag)"
            : url.hostname.endsWith("github.com") || url.hostname.endsWith("githubusercontent.com")
              ? "download hosted on GitHub, but not from this repository's releases"
              : `downloads an executable or archive from ${url.hostname}`;
        yield { line, text, column: index, note };
        break;
      }
    }
  },
};

const DOWNLOAD_CONTEXT =
  /\b(?:download\w*|install\w*|setup|mirror|launcher|loader|crack\w*|cheat\w*|activat\w*|keygen|exe|zip|rar|7z|get\s+it|click\s+here)\b|📥|⬇/i;

const SHORTENED_LINK: Rule = {
  id: "GR-LINK-002",
  title: "Link shortener hides the real destination",
  category: "links",
  weight: 15,
  appliesTo: DOC_PATTERNS,
  why:
    "A shortened or ad-gated link hides where it leads, and its target can be changed at any " +
    "time after review. Fake download pages rely on this.",
  *scanText(file: TextFile): Iterable<Hit> {
    for (const { line, text } of iterScanLines(file.content)) {
      for (const { url, index } of extractLinks(text)) {
        if (!hostMatches(url.hostname, SHORTENERS)) continue;
        // A short link is one slug ("bit.ly/3xYz"); deeper paths are the service's own pages.
        const segments = pathSegments(url);
        const gate = hostMatches(url.hostname, AD_GATES);
        if (gate ? segments.length === 0 : segments.length !== 1) continue;
        // Short links to surveys and articles are everywhere; a short *download* link is the lure.
        if (!gate && !DOWNLOAD_CONTEXT.test(text)) continue;
        yield { line, text, column: index, ...note("hostLink", { host: url.hostname }) };
        break;
      }
    }
  },
};

/** Documents and media: a book or picture shared on Dropbox is not a program. */
const DOCUMENT_EXTENSIONS = /\.(?:pdf|epub|mobi|azw3|djvu|txt|md|csv|png|jpe?g|gif|webp|svg|mp3|mp4|webm|ogg|wav)$/i;

/**
 * A link to a shared file rather than to the service itself: file links carry an
 * ID ("mega.nz/file/AbC#key", "gofile.io/d/x1Y2", "mediafire.com/?abc123").
 * Homepages and pages like "dropbox.com/developers" or "gofile.io/api" do not.
 */
function looksLikeSharedFile(url: URL): boolean {
  if (DOCUMENT_EXTENSIONS.test(url.pathname)) return false;
  const segments = pathSegments(url);
  if (url.search.length > 1 || url.hash.length > 1 || segments.length >= 2) return true;
  if (segments.length === 0) return false;
  const only = segments[0];
  // One segment: an ID has digits or mixed case, or a file name has an extension.
  return /\d/.test(only) || (/[a-z]/.test(only) && /[A-Z]/.test(only)) || /\.[a-z0-9]{2,4}$/i.test(only);
}

const FILE_HOST_LINK: Rule = {
  id: "GR-LINK-003",
  title: "Download from a file-sharing site",
  category: "links",
  weight: 20,
  appliesTo: DOC_PATTERNS,
  why:
    "File-sharing sites (MediaFire, MEGA, Google Drive, Dropbox, Discord attachments, ...) " +
    "host files nobody has reviewed and that can be swapped at any time. A source-code " +
    "repository that sends you there instead of its own releases is a classic lure.",
  *scanText(file: TextFile): Iterable<Hit> {
    for (const { line, text } of iterScanLines(file.content)) {
      for (const { url, index } of extractLinks(text)) {
        const host = url.hostname.toLowerCase();
        const docsDownload = host === "docs.google.com" && url.pathname.startsWith("/uc");
        if (!docsDownload && !hostMatches(host, FILE_HOSTS)) continue;
        if (!looksLikeSharedFile(url)) continue;
        yield { line, text, column: index, ...note("hostLink", { host }) };
        break;
      }
    }
  },
};

const PASSWORD_WORD = String.raw`(?:şifre|parola|password|passwd|pass|pwd|pw|kennwort|contraseña|senha|пароль)`;
/**
 * A password handed out as a label at the start of a line, with markdown, list or
 * emoji decoration: "Password: 1234", "**Archive password** - infected",
 * "> şifre = 2026", "The password is 2025". Mentions inside a sentence
 * ("Create an archive with a password:") and "password-protected" are not labels.
 */
const EN_DASH = String.fromCodePoint(0x2013);
const EMOJI_VARIATION = String.fromCodePoint(0xfe0f);
const PASSWORD_LABEL = new RegExp(
  String.raw`^[\s>*_#|•\-+.\d)\p{Extended_Pictographic}${EMOJI_VARIATION}]*` +
    String.raw`(?:(?:the|archive|zip|rar|7z|file|extraction|unzip|arşiv|dosya)\s+){0,2}` +
    PASSWORD_WORD +
    String.raw`[*_|]*(?:\s*[:=]|\s+[-${EN_DASH}]\s|\s+is\b:?)[\s*_\x60"']*([^\s*_\x60"'|]+)`,
  "iu",
);
const ARCHIVE_MENTION = /\.(?:zip|rar|7z)\b|\b(?:zip|rar|7z|archive|arşiv\w*|arsiv\w*|archiv\w*)\b/i;
const ARCHIVE_WINDOW = 10;

/** Values that are not a password someone is told to type: placeholders, templates, comments, code. */
function isRealPasswordValue(value: string, rest: string): boolean {
  if (/^(?:#|\/\/|<|\[|\(|null|none|undefined|true|false)/i.test(value)) return false;
  if (/^\$\w|\$\{|\{\{|\$\(/.test(value)) return false;
  // "password: 'hunter2'," in a code sample: a quoted value followed by a comma.
  if (/^\s*["'][^"']*["']\s*[,;)]/.test(rest)) return false;
  return true;
}

const ARCHIVE_PASSWORD: Rule = {
  id: "GR-LINK-004",
  title: "Password given for an archive",
  category: "links",
  weight: 25,
  appliesTo: DOC_PATTERNS,
  why:
    "A password-protected archive cannot be opened by antivirus, GitHub or this scanner. " +
    "Publishing the password next to the download is how malware gets past every scanner " +
    "and still reaches the victim.",
  *scanText(file: TextFile): Iterable<Hit> {
    if (!ARCHIVE_MENTION.test(file.content)) return;
    const lines = splitLines(file.content);
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      const m = PASSWORD_LABEL.exec(text);
      if (!m) continue;
      const valueAt = m.index + m[0].length - m[1].length;
      if (!isRealPasswordValue(m[1], text.slice(Math.max(0, valueAt - 1)))) continue;
      // The archive has to be nearby, not anywhere in a long document.
      const near = lines.slice(Math.max(0, i - ARCHIVE_WINDOW), i + ARCHIVE_WINDOW + 1).join("\n");
      if (!ARCHIVE_MENTION.test(near)) continue;
      yield { line: i + 1, text, column: m.index };
    }
  },
};

const DISABLE_AV_PATTERNS: readonly RegExp[] = [
  /\b(?:disable|turn\s+off|deactivate|pause|uninstall|close|exit|whitelist)\s+(?:your\s+|the\s+|all\s+|any\s+)?(?:anti-?virus(?:es)?|av\b|windows\s+defender|defender|real-?time\s+protection|virus\s+(?:&\s+threat\s+)?protection|security\s+software|smart\s?screen)/i,
  /\b(?:anti-?virus|defender|av\b|virustotal)[^.\n]{0,80}\bfalse[\s-]positive/i,
  /\bfalse[\s-]positive[^.\n]{0,80}\b(?:anti-?virus|defender|av\b|virustotal)/i,
  // "Add the folder to exclusions"; a bare "add an exclusion" needs an antivirus nearby
  // ("... then add the exclusion" is also how linters are configured).
  /\badd\s+(?:the\s+|this\s+|your\s+|our\s+)?(?:game\s+|install(?:ation)?\s+|program\s+)?(?:folder|file|directory|program|app|exe|it)\s+to\s+(?:the\s+|your\s+)?(?:exclusions?|exceptions?|whitelist|allow\s?list)\b/i,
  /\badd\s+(?:an?\s+|the\s+)?exclusions?\b(?=[^\n]{0,120}\b(?:anti-?virus|defender|av|windows\s+security)\b)|\b(?:anti-?virus|defender|av|windows\s+security)\b[^\n]{0,120}\badd\s+(?:an?\s+|the\s+)?exclusions?\b/i,
  /(?<!\p{L})(?:antivir[üu]s|defender)\p{L}*\s+(?:\S+\s+){0,2}(?:kapat|devre\s+d[ıi][şs][ıi])/iu,
];

const RELEASE_NOTES = /^(?:change(?:s|log)|history|news|release[-_ ]?notes|releases)(?:\.[a-z]+)?$/i;

const DISABLE_ANTIVIRUS: Rule = {
  id: "GR-SOC-001",
  title: "Asks you to disable your antivirus",
  category: "social",
  weight: 25,
  appliesTo: DOC_PATTERNS,
  why:
    "Telling users to turn off Windows Defender, add an exclusion or ignore a \"false " +
    "positive\" is the signature move of fake cheat, crack and tool repositories: the " +
    "download would be blocked otherwise.",
  *scanText(file: TextFile): Iterable<Hit> {
    // Release notes report history ("fewer antivirus false positives"); nobody follows them as instructions.
    if (RELEASE_NOTES.test(basename(file.path))) return;
    for (const { line, text } of iterScanLines(file.content)) {
      for (const p of DISABLE_AV_PATTERNS) {
        const m = p.exec(text);
        if (m) {
          yield { line, text, column: m.index };
          break;
        }
      }
    }
  },
};

/**
 * Kinds of malware tooling. Research lists and security products mention the
 * threats (ransomware, keyloggers, botnets); only offensive kinds (builders,
 * crypters, FUD, antivirus bypass, cracked tools) are things nobody but an
 * attacker buys.
 */
const MALWARE_KINDS: readonly { label: string; pattern: RegExp; offensive?: true }[] = [
  { label: "RAT", pattern: /\bRATs?\b|\bremote access trojans?\b/ },
  { label: "RAT builder", pattern: /\brat builders?\b/i, offensive: true },
  { label: "ransomware", pattern: /\bransomware\b/i },
  { label: "crypter", pattern: /\bcrypters?\b/i, offensive: true },
  { label: "stealer", pattern: /\b(?:info[- ]?|password |token |cookie )?stealers?\b/i },
  { label: "keylogger", pattern: /\bkey ?loggers?\b/i },
  { label: "botnet", pattern: /\bbotnets?\b/i },
  { label: "malware builder", pattern: /\b(?:virus|malware|trojan|worm|exploit|payload|ransomware|stealer|keylogger|botnet) builders?\b/i, offensive: true },
  { label: "FUD", pattern: /\bFUD\b|\bfully undetectable\b/i, offensive: true },
  { label: "antivirus bypass", pattern: /\b(?:bypass(?:es|ing)?|evad(?:es?|ing)) (?:all )?(?:anti-?virus(?:es)?|AVs?|windows defender|defender)\b/i, offensive: true },
  { label: "hidden miner", pattern: /\b(?:silent|hidden|stealth) (?:crypto ?)?miners?\b/i, offensive: true },
  { label: "named RAT family", pattern: /\b(?:njRAT|AsyncRAT|Quasar|Remcos|DarkComet|Orcus|SpyNote|SpyMAX|AhMyth|Adwind|NanoCore|DCRat|XWorm|Venom ?RAT)\b/i },
  { label: "cracked tools", pattern: /\bcracked\b/i, offensive: true },
];
/** Selling: a price or a buy/payment request. */
const SALE = /\b(?:price|pricing|buy|purchase|payment|pay)\b|(?:^|[\s(`])\$\s?\d{1,5}\b|\b\d{1,5}(?:\.\d{2})?\s?(?:\$|USD|USDT|EUR|€)/i;
/**
 * A storefront's own call to buy: a shop or chat-to-buy link, "contact us", or
 * "buy/contact/DM ... on WhatsApp/Telegram". A threat report saying an actor
 * "sells a crypter on Telegram" is not one.
 */
const STOREFRONT =
  /\b(?:sellix\.io|shoppy\.gg|selly\.(?:gg|io)|rzp\.io)\b|\bwa\.me\/|\bcontact us\b|\b(?:contact|dm|message|text|buy|order|purchase)\b[^\n]{0,80}\b(?:what'?s ?app|telegram|t\.me\/|discord|e-?mail|instagram)\b/i;
/** Fewer kinds is a security write-up mentioning a technique, not a catalogue. */
const MIN_MALWARE_KINDS = 3;

const SELLS_MALWARE: Rule = {
  id: "GR-SOC-002",
  title: "Sells malware tools",
  category: "social",
  weight: 80,
  appliesTo: DOC_PATTERNS,
  why:
    "The README is a storefront for malware: RAT and ransomware builders, crypters, stealers, " +
    "paid for over WhatsApp, Telegram or a shop link. Such packs are illegal to use against " +
    "others, and the copies they sell are often infected themselves or never delivered.",
  *scanText(file: TextFile): Iterable<Hit> {
    if (RELEASE_NOTES.test(basename(file.path))) return;
    const found = MALWARE_KINDS.filter((k) => k.pattern.test(file.content));
    if (found.length < MIN_MALWARE_KINDS || !found.some((k) => k.offensive) || !SALE.test(file.content)) return;
    const kinds = found.map((k) => k.label);
    for (const { line, text } of iterScanLines(file.content)) {
      const m = STOREFRONT.exec(text);
      if (m) {
        yield { line, text, column: m.index, ...note("sellsMalware", { kinds: `${kinds.slice(0, 5).join(", ")}${kinds.length > 5 ? ", ..." : ""}` }) };
        return;
      }
    }
  },
};

export const RULES: readonly Rule[] = [DOWNLOAD_LINK, SHORTENED_LINK, FILE_HOST_LINK, ARCHIVE_PASSWORD, DISABLE_ANTIVIRUS, SELLS_MALWARE];
