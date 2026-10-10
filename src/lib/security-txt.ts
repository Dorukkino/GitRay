/** RFC 9116 security.txt: where to report a vulnerability in GiTRay itself. */

import { contactEmail, siteUrl } from "./site";

/** How long the file says it is valid; RFC 9116 asks for less than a year. */
const VALID_MS = 180 * 24 * 60 * 60 * 1000;

/** The file's text, or null without a contact address (Contact is the one required field). */
export function securityTxt(contact = contactEmail(), now = Date.now(), base = siteUrl()): string | null {
  if (!contact) return null;
  return [
    `Contact: mailto:${contact}`,
    `Expires: ${new Date(now + VALID_MS).toISOString().replace(/\.\d{3}Z$/, "Z")}`,
    "Preferred-Languages: en, tr",
    `Canonical: ${base}/.well-known/security.txt`,
    "",
  ].join("\n");
}
