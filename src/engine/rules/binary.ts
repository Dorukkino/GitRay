/**
 * GR-BIN-*: binary files committed to the repository. They are never run or
 * unpacked; only their first bytes (magic numbers and headers) are inspected.
 */

import type { BinaryFile, RepoInfo, ScanContext } from "../types";
import { note } from "../notes";
import type { Hit, Rule } from "./base";

const u16le = (b: Uint8Array, o: number): number => b[o] | (b[o + 1] << 8);
const u32le = (b: Uint8Array, o: number): number => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000;
const u32be = (b: Uint8Array, o: number): number => b[o] * 0x1000000 + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);

function startsWith(b: Uint8Array, magic: readonly number[], offset = 0): boolean {
  if (b.length < offset + magic.length) return false;
  return magic.every((v, i) => b[offset + i] === v);
}

const LNK_MAGIC = [0x4c, 0x00, 0x00, 0x00, 0x01, 0x14, 0x02, 0x00];
const MACHO_MAGICS = [
  [0xfe, 0xed, 0xfa, 0xce],
  [0xfe, 0xed, 0xfa, 0xcf],
  [0xce, 0xfa, 0xed, 0xfe],
  [0xcf, 0xfa, 0xed, 0xfe],
];

/** What kind of native executable the bytes are, if any. */
export type ExecutableKind = "exePe" | "exeDll" | "exeElf" | "exeMacho" | "exeMachoUniversal" | "exeLnk";

/** The program kind from a file's first bytes, as a note key, or null. */
export function executableKind(b: Uint8Array): ExecutableKind | null {
  if (startsWith(b, [0x4d, 0x5a]) && b.length >= 0x40) {
    const pe = u32le(b, 0x3c);
    if (pe + 24 <= b.length && startsWith(b, [0x50, 0x45, 0x00, 0x00], pe)) {
      const characteristics = u16le(b, pe + 22);
      return characteristics & 0x2000 ? "exeDll" : "exePe";
    }
    return null;
  }
  if (startsWith(b, [0x7f, 0x45, 0x4c, 0x46])) return "exeElf";
  if (MACHO_MAGICS.some((m) => startsWith(b, m))) return "exeMacho";
  // 0xCAFEBABE is also a Java class file; a fat Mach-O has a small architecture count there.
  if (startsWith(b, [0xca, 0xfe, 0xba, 0xbe]) && b.length >= 8) {
    const count = u32be(b, 4);
    if (count > 0 && count < 20) return "exeMachoUniversal";
  }
  if (startsWith(b, LNK_MAGIC)) return "exeLnk";
  return null;
}

// Names that matter even when the ZIP cannot be opened (too large, ZIP64): Windows
// programs, launchers, encoded scripts and disk images. Plain scripts (.bat, .ps1,
// .js) are left out: their contents are scanned when the ZIP is opened.
const RISKY_NAME = /\.(?:exe|dll|scr|com|pif|msi|lnk|hta|vbe|jse|iso|img)$/i;

const PACKAGE_ARCHIVE = /\.(?:whl|egg|nupkg|snupkg)$/i;

export interface ZipInfo {
  encrypted: boolean;
  names: string[];
}

/** Walk ZIP local file headers that fit in the bytes we have. */
export function zipInfo(b: Uint8Array): ZipInfo | null {
  if (!startsWith(b, [0x50, 0x4b, 0x03, 0x04])) return null;
  const info: ZipInfo = { encrypted: false, names: [] };
  let o = 0;
  for (let i = 0; i < 100 && startsWith(b, [0x50, 0x4b, 0x03, 0x04], o) && o + 30 <= b.length; i++) {
    const flags = u16le(b, o + 6);
    const compressed = u32le(b, o + 18);
    const nameLen = u16le(b, o + 26);
    const extraLen = u16le(b, o + 28);
    if (o + 30 + nameLen > b.length) break;
    info.encrypted ||= (flags & 1) === 1;
    info.names.push(new TextDecoder().decode(b.subarray(o + 30, o + 30 + nameLen)));
    // With a data descriptor (bit 3) the size is only known after the data.
    if (flags & 8) break;
    o += 30 + nameLen + extraLen + compressed;
  }
  return info;
}

/** RAR archives whose headers (file names included) are encrypted. */
export function rarHeadersEncrypted(b: Uint8Array): boolean {
  if (startsWith(b, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00])) {
    // RAR 4: main header flags, MHD_PASSWORD.
    return b.length >= 12 && b[9] === 0x73 && (u16le(b, 10) & 0x0080) !== 0;
  }
  if (startsWith(b, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00])) {
    // RAR 5: the first header after the CRC is an "archive encryption header" (type 4).
    let o = 12;
    while (o < b.length && b[o] & 0x80) o++; // header size (vint)
    o++;
    return o < b.length && b[o] === 4;
  }
  return false;
}

const EXECUTABLE: Rule = {
  id: "GR-BIN-001",
  title: "Executable file committed to the repository",
  category: "binary",
  weight: 20,
  why:
    "A ready-to-run program inside a source repository cannot be reviewed like code: what " +
    "you see on GitHub is not what runs. Fake projects ship the payload this way, often " +
    "next to source code that does nothing. Windows shortcut (.lnk) files are a common " +
    "malware launcher.",
  *scanBinary(file: BinaryFile): Iterable<Hit> {
    const kind = executableKind(file.head);
    if (kind) {
      yield { line: 0, text: "", weight: kind === "exeLnk" ? 30 : undefined, ...note(kind) };
      return;
    }
    const zip = zipInfo(file.head);
    const inner = zip?.names.find((n) => RISKY_NAME.test(n));
    if (!inner) return;
    // Language packages (Python wheels, NuGet) ship native libraries and launchers for
    // their package manager; nobody is lured into double-clicking inside one.
    yield PACKAGE_ARCHIVE.test(file.path)
      ? { line: 0, text: inner, weight: 5, ...note("zipPackageExe") }
      : { line: 0, text: inner, ...note("zipExe") };
  },
};

const ENCRYPTED_ARCHIVE: Rule = {
  id: "GR-BIN-002",
  title: "Password-protected archive in the repository",
  category: "binary",
  weight: 30,
  why:
    "An encrypted archive cannot be inspected by GitHub, antivirus or this scanner. Legit " +
    "projects have no reason to commit one; malware does it to slip past every scanner.",
  *scanBinary(file: BinaryFile): Iterable<Hit> {
    if (zipInfo(file.head)?.encrypted) yield { line: 0, text: "", ...note("zipEncrypted") };
    else if (rarHeadersEncrypted(file.head)) yield { line: 0, text: "", ...note("rarEncrypted") };
  },
};

/** Detections at which a file counts as known malware rather than a possible false positive. */
export const KNOWN_MALWARE_DETECTIONS = 5;

const KNOWN_TO_ANTIVIRUS: Rule = {
  id: "GR-BIN-003",
  title: "Antivirus engines detect a file (VirusTotal)",
  category: "binary",
  weight: 70,
  why:
    "VirusTotal runs files through about 70 antivirus engines. This exact file, matched by its " +
    "SHA-256 fingerprint (nothing is downloaded or run), is detected by some of them. Five or " +
    "more detections mean known malware. A few detections are common false positives on " +
    "installers and small launchers, so they weigh little.",
  *scanRepo(_info: RepoInfo, ctx: ScanContext): Iterable<Hit> {
    for (const f of ctx.flaggedFiles ?? []) {
      if (f.reputation.status !== "found") continue;
      const s = f.reputation.stats;
      const total = s.malicious + s.suspicious + s.harmless + s.undetected;
      const known = s.malicious >= KNOWN_MALWARE_DETECTIONS;
      yield {
        path: f.source === "repository" ? f.name : "",
        line: 0,
        text: f.source === "release" ? `release asset ${f.name}` : "",
        weight: known ? undefined : 10,
        ...note(f.source === "release" ? (known ? "avReleaseKnown" : "avReleaseMaybe") : (known ? "avRepoKnown" : "avRepoMaybe"), { bad: s.malicious, total }),
      };
    }
  },
};

export const RULES: readonly Rule[] = [EXECUTABLE, ENCRYPTED_ARCHIVE, KNOWN_TO_ANTIVIRUS];
