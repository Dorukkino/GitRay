/**
 * The README "security badge": a self-contained SVG showing a repository's
 * latest GiTRay verdict. It contains no repository-derived text — only our
 * fixed label and a verdict word from a closed set — so there is nothing
 * untrusted to inject. Rendered as a string (no runtime/fonts needed).
 */

export type BadgeStatus = "clean" | "suspicious" | "dangerous" | "incomplete" | "not scanned";

// Light-mode hex from globals.css: dark enough for white text, theme-agnostic
// since a README renders on both light and dark GitHub.
export const BADGE_COLOR: Record<BadgeStatus, string> = {
  clean: "#0b8457",
  suspicious: "#b45f06",
  dangerous: "#cf2e4a",
  incomplete: "#0a6fb0",
  "not scanned": "#767676",
};

const LABEL = "GiTRay";

function esc(s: string): string {
  return s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Rough text width at 11px; the labels are a small fixed set, so an estimate is fine. */
function textWidth(s: string): number {
  return Math.round(s.length * 6.5) + 14;
}

export function badgeSvg(status: BadgeStatus): string {
  const color = BADGE_COLOR[status];
  const lw = textWidth(LABEL);
  const rw = textWidth(status);
  const w = lw + rw;
  const aria = esc(`${LABEL}: ${status}`);
  const label = esc(LABEL);
  const right = esc(status);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${aria}">
<title>${aria}</title>
<linearGradient id="g" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="c"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#c)">
<rect width="${lw}" height="20" fill="#2b3137"/>
<rect x="${lw}" width="${rw}" height="20" fill="${color}"/>
<rect width="${w}" height="20" fill="url(#g)"/>
</g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
<text x="${lw / 2}" y="14">${label}</text>
<text x="${lw + rw / 2}" y="15" fill="#010101" fill-opacity=".3">${right}</text>
<text x="${lw + rw / 2}" y="14">${right}</text>
</g>
</svg>`;
}
