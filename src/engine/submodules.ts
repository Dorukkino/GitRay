/**
 * Git submodules (.gitmodules). GitHub's tarball does not include them, but
 * "git clone --recursive" downloads them from other repositories: code that
 * this scan never saw. They are listed in the report so they can be scanned too.
 */

import { InvalidTarget } from "./errors";
import { fullName, parseTarget } from "./target";

export interface Submodule {
  /** Where the submodule is checked out inside the repository. */
  path: string;
  /** Where it is cloned from, as written in .gitmodules. */
  url: string;
  /** "owner/repo" when it lives on github.com (can be scanned here), else null. */
  github: string | null;
}

export const MAX_SUBMODULES = 50;

const HTTP_URL = /^(?:https?|git|ssh):\/\/(?:[^@/]+@)?(?:www\.)?github\.com(?::\d+)?\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i;
const SCP_URL = /^(?:[^@/\s]+@)?github\.com:\/?([^/]+)\/([^/]+?)(?:\.git)?\/?$/i;
// Relative to the superproject's own remote: "../sibling.git".
const RELATIVE_URL = /^\.\.\/([^/]+?)(?:\.git)?\/?$/;

function githubRepo(url: string, owner: string | null): string | null {
  const m = HTTP_URL.exec(url) ?? SCP_URL.exec(url);
  const parts = m ? [m[1], m[2]] : owner && RELATIVE_URL.test(url) ? [owner, RELATIVE_URL.exec(url)![1]] : null;
  if (!parts) return null;
  try {
    return fullName(parseTarget(`${parts[0]}/${parts[1]}`));
  } catch (e) {
    if (e instanceof InvalidTarget) return null;
    throw e;
  }
}

/** Parse .gitmodules (git config syntax). `owner` resolves "../repo" URLs. */
export function parseGitmodules(content: string, owner: string | null): Submodule[] {
  const sections: { name: string; path?: string; url?: string }[] = [];
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const header = /^\[\s*submodule\s+"([^"]*)"\s*\]$/i.exec(line);
    if (header) {
      sections.push({ name: header[1] });
      continue;
    }
    if (line.startsWith("[")) {
      sections.push({ name: "" }); // another section: ignore its keys
      continue;
    }
    const kv = /^([A-Za-z][\w-]*)\s*=\s*(.*)$/.exec(line);
    const current = sections.at(-1);
    if (!kv || !current?.name) continue;
    const value = kv[2].replace(/^"(.*)"$/, "$1").trim();
    const key = kv[1].toLowerCase();
    if (key === "path") current.path = value;
    else if (key === "url") current.url = value;
  }
  return sections
    .filter((s) => s.name && s.url)
    .slice(0, MAX_SUBMODULES)
    .map((s) => ({ path: s.path ?? s.name, url: s.url!, github: githubRepo(s.url!, owner) }));
}
