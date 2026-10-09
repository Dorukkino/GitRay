/**
 * GR-LINK-* and GR-SOC-*: the README side of repo malware. Fake projects
 * (cheats, cracks, "free" tools) rarely hide malware in their code: they send
 * visitors to an archive or executable somewhere else, often with a password
 * and a request to turn off the antivirus.
 */

import { iterScanLines } from "../text";
import type { RepoInfo, ScanContext, TextFile } from "../types";
import type { Hit, Rule } from "./base";

export const DOC_PATTERNS = ["*.md", "*.markdown", "*.mdown", "*.rst", "*.adoc", "*.asciidoc", "*.txt", "README*"];

const RISKY_EXTENSIONS = [
  ".zip", ".rar", ".7z", ".iso", ".img",
  // Windows
  ".exe", ".msi", ".msix", ".scr", ".bat", ".cmd", ".ps1", ".vbs", ".hta", ".lnk", ".com", ".pif",
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

const URL_RE = /https?:\/\/[^\s<>"'()[\]`]+/gi;
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
    if (url) yield { url, index: m.index };
  }
  for (const m of segment.matchAll(BARE_RE)) {
    if (seen.has(m.index)) continue;
    const url = toUrl(`https://${m[0]}`);
    if (url && (SHORTENERS.has(url.hostname) || hostMatches(url.hostname, FILE_HOSTS))) {
      yield { url, index: m.index };
    }
  }
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
  if (rest.startsWith("releases/download/")) return "release";
  const archive = /^archive\/(?:refs\/heads\/)?(.+?)\.(?:zip|tar\.gz)$/.exec(rest);
  if (!archive) return null;
  const ref = archive[1];
  return ref === info.defaultBranch.toLowerCase() || ref === info.headSha ? "archive" : "other-archive";
}

function hasRiskyExtension(url: URL): boolean {
  const path = url.pathname.toLowerCase();
  return RISKY_EXTENSIONS.some((ext) => path.endsWith(ext));
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
        yield { line, text, column: index, note: `${url.hostname} link` };
        break;
      }
    }
  },
};

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
        yield { line, text, column: index, note: `${host} link` };
        break;
      }
    }
  },
};

const PASSWORD = /(?<![\p{L}\p{N}_])(?:şifre|parola|password|passwd|pass|pwd|pw|kennwort|contraseña|senha|пароль)(?![\p{L}\p{N}_])\s*[:=]/iu;
const ARCHIVE_MENTION = /\.(?:zip|rar|7z)\b|\b(?:zip|rar|7z|archive|arşiv\w*|arsiv\w*|archiv\w*)\b/i;

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
    for (const { line, text } of iterScanLines(file.content)) {
      const m = PASSWORD.exec(text);
      if (m) yield { line, text, column: m.index };
    }
  },
};

const DISABLE_AV_PATTERNS: readonly RegExp[] = [
  /\b(?:disable|turn\s+off|deactivate|pause|uninstall|close|exit|whitelist)\s+(?:your\s+|the\s+|all\s+|any\s+)?(?:anti-?virus(?:es)?|av\b|windows\s+defender|defender|real-?time\s+protection|virus\s+(?:&\s+threat\s+)?protection|security\s+software|smart\s?screen)/i,
  /\b(?:anti-?virus|defender|av\b|virustotal)[^.\n]{0,80}\bfalse[\s-]positive/i,
  /\bfalse[\s-]positive[^.\n]{0,80}\b(?:anti-?virus|defender|av\b|virustotal)/i,
  /\badd\s+(?:an?\s+|the\s+)?(?:folder\s+|file\s+)?(?:to\s+(?:the\s+)?)?exclusions?\b/i,
  /(?<!\p{L})(?:antivir[üu]s|defender)\p{L}*\s+(?:\S+\s+){0,2}(?:kapat|devre\s+d[ıi][şs][ıi])/iu,
];

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

export const RULES: readonly Rule[] = [DOWNLOAD_LINK, SHORTENED_LINK, FILE_HOST_LINK, ARCHIVE_PASSWORD, DISABLE_ANTIVIRUS];
