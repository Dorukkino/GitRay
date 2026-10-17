/**
 * Cleans a visitor's free-text note before it is stored and later shown in the
 * admin panel: drops control, bidi and zero-width characters (so it is well
 * formed and cannot carry a Trojan-Source trick), collapses runs of spaces,
 * trims, and caps the length. The character set is built from code points, so
 * this file itself holds no invisible characters.
 */

const cp = (n: number): string => String.fromCodePoint(n);

const BAD = new Set<string>();
for (let i = 0; i <= 0x1f; i++) if (i !== 0x09 && i !== 0x0a) BAD.add(cp(i)); // controls except tab, newline
BAD.add(cp(0x7f));
for (const n of [
  0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069, 0x2028,
  0x2029, 0xfeff, 0x3164,
]) {
  BAD.add(cp(n));
}

export const MAX_REASON = 2000;
export const MIN_REASON = 3;

/** The cleaned note, or null when it is not a string or too short after cleaning. */
export function sanitizeReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let out = "";
  for (const ch of raw) if (!BAD.has(ch)) out += ch; // iterates whole code points, never splits a surrogate pair
  out = out.replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_REASON);
  return out.length >= MIN_REASON ? out : null;
}
