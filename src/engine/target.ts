/** Parse and validate the repository the user wants to scan. */

import { InvalidTarget } from "./errors";
import type { RepoRef } from "./types";

// GitHub logins: alphanumerics and single hyphens, max 39 chars, no leading hyphen.
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

/**
 * Accepts "owner/repo", "github.com/owner/repo" and full GitHub URLs, including
 * links to a branch or file ("https://github.com/owner/repo/tree/main/src").
 */
export function parseTarget(raw: string): RepoRef {
  const text = raw.trim();
  const fail = (): never => {
    throw new InvalidTarget(`Not a GitHub repository: ${JSON.stringify(text.slice(0, 100))}`);
  };
  if (!text || text.length > 300) fail();

  let path = text;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : null;
  const hostFirst = /^(?:www\.)?github\.com\//i.test(text) ? `https://${text}` : null;
  const asUrl = withScheme ?? hostFirst;
  if (asUrl) {
    let url: URL;
    try {
      url = new URL(asUrl);
    } catch {
      return fail();
    }
    if (!["http:", "https:"].includes(url.protocol) || !GITHUB_HOSTS.has(url.hostname)) fail();
    if (url.username || url.password || url.port) fail();
    path = url.pathname;
  }

  const parts = path.split("/").filter(Boolean);
  // A bare "owner/repo" must be exactly two segments; URLs may point deeper.
  if (parts.length < 2 || (!asUrl && parts.length !== 2)) fail();
  const owner = parts[0];
  let repo = parts[1];
  if (repo.toLowerCase().endsWith(".git")) repo = repo.slice(0, -4);
  if (!OWNER.test(owner) || !REPO.test(repo) || repo === "." || repo === "..") fail();
  return { owner, repo };
}

export function fullName(ref: RepoRef): string {
  return `${ref.owner}/${ref.repo}`;
}
