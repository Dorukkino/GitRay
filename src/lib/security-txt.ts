/** RFC 9116 security.txt: where to report a vulnerability in GiTRay itself. */

import { SECURITY_POLICY_URL, SECURITY_REPORT_URL, siteUrl } from "./site";

/** How long the file says it is valid; RFC 9116 asks for less than a year. */
const VALID_MS = 180 * 24 * 60 * 60 * 1000;

export function securityTxt(now = Date.now(), base = siteUrl()): string {
  return [
    `Contact: ${SECURITY_REPORT_URL}`,
    `Expires: ${new Date(now + VALID_MS).toISOString().replace(/\.\d{3}Z$/, "Z")}`,
    `Policy: ${SECURITY_POLICY_URL}`,
    "Preferred-Languages: en, tr",
    `Canonical: ${base}/.well-known/security.txt`,
    "",
  ].join("\n");
}
