/**
 * Minimal GitHub API client: repository metadata and the tarball byte stream.
 *
 * Release assets are never downloaded; only the sha256 digest GitHub reports is read.
 * Redirects (moved or renamed repositories) are followed only inside
 * api.github.com, at most MAX_API_REDIRECTS times; the tarball redirect only to
 * GitHub's download hosts, without the token.
 */

import { GitHubError, LimitExceeded } from "./errors";
import type { Limits } from "./limits";
import { ENGINE_VERSION } from "./version";
import type { ReleaseAsset, RepoInfo, RepoRef } from "./types";

export const API_URL = "https://api.github.com";
const RAW_URL = "https://raw.githubusercontent.com";
const TARBALL_HOSTS = new Set(["api.github.com", "codeload.github.com"]);
const MAX_API_REDIRECTS = 3;
const MAX_RELEASES = 10;
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const SHA = /^[0-9a-f]{40}$/;
const FULL_NAME = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const API_TIMEOUT_MS = 15_000;

type Fetch = typeof fetch;

export interface GitHubClientOptions {
  token?: string;
  fetch?: Fetch;
}

type Json = Record<string, unknown>;

export interface TreeEntry {
  path: string;
  /** blob: file or symlink; tree: directory; commit: submodule. */
  type: "blob" | "tree" | "commit";
  size: number;
}

function isObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export class GitHubClient {
  private readonly fetchImpl: Fetch;
  private readonly headers: Record<string, string>;

  constructor(options: GitHubClientOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": `gitray/${ENGINE_VERSION}`,
    };
    // The token is only ever sent to api.github.com and never logged.
    if (options.token) this.headers.Authorization = `Bearer ${options.token}`;
  }

  private async request(
    url: string,
    init: { accept?: string; signal?: AbortSignal; auth?: boolean; download?: boolean },
  ): Promise<Response> {
    const headers = { ...this.headers };
    if (init.accept) headers.Accept = init.accept;
    if (init.auth === false) delete headers.Authorization;
    // API calls get their own timeout; downloads are bounded by the caller's time budget.
    const timeout = AbortSignal.timeout(API_TIMEOUT_MS);
    const signal = init.download ? init.signal : init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    try {
      return await this.fetchImpl(url, { headers, redirect: "manual", signal });
    } catch (e) {
      if (init.download && init.signal?.aborted) throw e;
      if (init.signal?.aborted) throw new GitHubError("GitHub did not answer within the time budget");
      throw new GitHubError(`Request to GitHub failed (${e instanceof Error ? e.name : "error"})`);
    }
  }

  /** GET from the API, following redirects only within api.github.com. */
  private async get(path: string, accept?: string, signal?: AbortSignal): Promise<Response> {
    let url = `${API_URL}${path}`;
    for (let i = 0; i <= MAX_API_REDIRECTS; i++) {
      const resp = await this.request(url, { accept, signal });
      if (!REDIRECT_CODES.has(resp.status)) {
        await raiseForStatus(resp);
        return resp;
      }
      url = apiRedirectTarget(url, resp.headers.get("location"));
    }
    throw new GitHubError("Repository moved or renamed: too many redirects");
  }

  private async getJson(path: string, signal?: AbortSignal): Promise<unknown> {
    const resp = await this.get(path, undefined, signal);
    try {
      return await resp.json();
    } catch {
      throw new GitHubError("Invalid JSON from GitHub");
    }
  }

  /** `signal` bounds the whole lookup (every request also has its own timeout). */
  async getRepoInfo(ref: RepoRef, signal?: AbortSignal): Promise<RepoInfo> {
    const repo = await this.getJson(`/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`, signal);
    if (!isObject(repo) || !isObject(repo.owner)) throw new GitHubError("Unexpected repository response");
    if (repo.private === true) throw new GitHubError("Only public repositories can be scanned", "private");

    const fullName = str(repo.full_name);
    const defaultBranch = str(repo.default_branch);
    const createdAt = str(repo.created_at);
    const ownerLogin = str(repo.owner.login);
    if (!fullName || !FULL_NAME.test(fullName) || !defaultBranch || !createdAt || !ownerLogin) {
      throw new GitHubError("Unexpected repository response");
    }
    // Use the canonical name from here on: the requested one may be an old (renamed) name.
    const base = `/repos/${fullName}`;

    const shaResp = await this.get(
      `${base}/commits/${encodeURIComponent(defaultBranch)}`,
      "application/vnd.github.sha",
      signal,
    );
    const headSha = (await shaResp.text()).trim();
    if (!SHA.test(headSha)) throw new GitHubError("Unexpected commit SHA from GitHub");

    const [ownerCreatedAt, releaseAssets] = await Promise.all([
      this.ownerCreatedAt(ownerLogin, signal),
      this.releaseAssets(base, signal),
    ]);

    return {
      fullName,
      description: str(repo.description),
      sizeKb: num(repo.size),
      createdAt,
      pushedAt: str(repo.pushed_at),
      defaultBranch,
      headSha,
      stars: num(repo.stargazers_count),
      forks: num(repo.forks_count),
      isFork: repo.fork === true,
      archived: repo.archived === true,
      ownerLogin,
      ownerType: str(repo.owner.type) ?? "",
      ownerCreatedAt,
      releaseAssets,
    };
  }

  private async ownerCreatedAt(login: string, signal?: AbortSignal): Promise<string | null> {
    try {
      const user = await this.getJson(`/users/${encodeURIComponent(login)}`, signal);
      return isObject(user) ? str(user.created_at) : null;
    } catch {
      return null;
    }
  }

  private async releaseAssets(base: string, signal?: AbortSignal): Promise<ReleaseAsset[]> {
    const releases = await this.getJson(`${base}/releases?per_page=${MAX_RELEASES}`, signal);
    if (!Array.isArray(releases)) throw new GitHubError("Unexpected releases response");
    const assets: ReleaseAsset[] = [];
    for (const rel of releases) {
      if (!isObject(rel) || !Array.isArray(rel.assets)) continue;
      for (const a of rel.assets) {
        if (!isObject(a)) continue;
        assets.push({
          releaseTag: str(rel.tag_name) ?? "",
          name: str(a.name) ?? "",
          size: num(a.size),
          digest: str(a.digest),
        });
      }
    }
    return assets;
  }

    /**
   * Every path in the commit (one API request). `truncated` means GitHub cut
   * the list short (very large repositories), so it cannot be used to compare.
   */
  async listTree(info: RepoInfo, signal?: AbortSignal): Promise<{ entries: TreeEntry[]; truncated: boolean }> {
    if (!SHA.test(info.headSha) || !FULL_NAME.test(info.fullName)) throw new GitHubError("Invalid tree target");
    const data = await this.getJson(`/repos/${info.fullName}/git/trees/${info.headSha}?recursive=1`, signal);
    if (!isObject(data) || !Array.isArray(data.tree)) throw new GitHubError("Unexpected tree response");
    const entries: TreeEntry[] = [];
    for (const e of data.tree) {
      if (!isObject(e) || typeof e.path !== "string") continue;
      if (e.type !== "blob" && e.type !== "tree" && e.type !== "commit") continue;
      entries.push({ path: e.path, type: e.type, size: num(e.size) });
    }
    return { entries, truncated: data.truncated === true };
  }

  /**
   * Download one file of the commit from raw.githubusercontent.com (not an API
   * request, no token sent), reading at most `maxBytes`.
   */
  async fetchRaw(
    info: RepoInfo,
    path: string,
    maxBytes: number,
    signal?: AbortSignal,
  ): Promise<{ bytes: Uint8Array; truncated: boolean }> {
    if (!SHA.test(info.headSha) || !FULL_NAME.test(info.fullName)) throw new GitHubError("Invalid file target");
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    const resp = await this.request(`${RAW_URL}/${info.fullName}/${info.headSha}/${encoded}`, {
      signal,
      auth: false,
      download: true,
    });
    if (!resp.ok || !resp.body) {
      await resp.body?.cancel();
      throw new GitHubError(`Could not download a file from GitHub (HTTP ${resp.status})`);
    }
    const parts: Uint8Array[] = [];
    let total = 0;
    let truncated = false;
    for await (const chunk of iterBody(resp.body)) {
      const room = maxBytes - total;
      if (chunk.length > room) {
        parts.push(chunk.subarray(0, room));
        total = maxBytes;
        truncated = true;
        break;
      }
      parts.push(chunk);
      total += chunk.length;
    }
    const bytes = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
      bytes.set(p, off);
      off += p.length;
    }
    return { bytes, truncated };
  }

  /** Stream the raw (still gzipped) tarball of a commit. */
  async streamTarball(info: RepoInfo, limits: Limits, signal?: AbortSignal): Promise<AsyncIterable<Uint8Array>> {
    if (!SHA.test(info.headSha) || !FULL_NAME.test(info.fullName)) throw new GitHubError("Invalid tarball target");
    let resp = await this.request(`${API_URL}/repos/${info.fullName}/tarball/${info.headSha}`, { signal, download: true });
    if (REDIRECT_CODES.has(resp.status)) {
      const location = resp.headers.get("location") ?? "";
      let target: URL;
      try {
        target = new URL(location);
      } catch {
        throw new GitHubError("Tarball redirect to an invalid location");
      }
      if (target.protocol !== "https:" || !TARBALL_HOSTS.has(target.hostname)) {
        throw new GitHubError("Tarball redirect to an unexpected host");
      }
      await resp.body?.cancel();
      resp = await this.request(target.href, { signal, auth: target.hostname === "api.github.com", download: true });
    }
    await raiseForStatus(resp);
    const length = Number(resp.headers.get("content-length"));
    if (Number.isFinite(length) && length > limits.maxDownloadBytes) {
      await resp.body?.cancel();
      throw new LimitExceeded("maxDownloadBytes", limits.maxDownloadBytes, `download size exceeded ${limits.maxDownloadBytes} bytes`);
    }
    if (!resp.body) throw new GitHubError("Empty tarball response");
    return iterBody(resp.body);
  }
}

async function* iterBody(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) yield value;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

function apiRedirectTarget(current: string, location: string | null): string {
  let target: URL | null = null;
  try {
    target = location ? new URL(location, current) : null;
  } catch {
    target = null;
  }
  if (!target || target.protocol !== "https:" || target.hostname !== "api.github.com") {
    throw new GitHubError(
      "Repository moved or renamed, and GitHub redirected outside api.github.com; check the repository's new address",
    );
  }
  return target.href;
}

async function raiseForStatus(resp: Response): Promise<void> {
  if (resp.ok) return;
  await resp.body?.cancel();
  if (resp.status === 404) throw new GitHubError("Repository not found (or not public)", "not_found");
  if (resp.status === 401) {
    // The server's GITHUB_TOKEN is invalid or expired; say so instead of a bare status code.
    throw new GitHubError("GitHub rejected the server's access token (GITHUB_TOKEN is invalid or expired)");
  }
  if ((resp.status === 403 || resp.status === 429) && resp.headers.get("x-ratelimit-remaining") === "0") {
    throw new GitHubError("GitHub API rate limit reached; try again later", "rate_limited");
  }
  if (resp.status === 451) throw new GitHubError("Repository is unavailable for legal reasons", "not_found");
  throw new GitHubError(`GitHub API returned HTTP ${resp.status}`);
}
