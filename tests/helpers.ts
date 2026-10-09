/** Shared test helpers: an in-memory tarball builder and a fake GitHub API. */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync, gzipSync } from "node:zlib";

const enc = new TextEncoder();

export const SHA = "0123456789abcdef0123456789abcdef01234567";
export const ROOT = `octo-demo-${SHA.slice(0, 7)}/`;

function header(name: string, type: string, size: number, linkname = ""): Uint8Array {
  const h = new Uint8Array(512);
  const put = (s: string, off: number, len: number) => h.set(enc.encode(s).subarray(0, len), off);
  put(name, 0, 100);
  put("0000644\0", 100, 8);
  put("0000000\0", 108, 8);
  put("0000000\0", 116, 8);
  put(`${size.toString(8).padStart(11, "0")}\0`, 124, 12);
  put("00000000000\0", 136, 12);
  put("        ", 148, 8);
  put(type, 156, 1);
  put(linkname, 157, 100);
  put("ustar\0", 257, 6);
  put("00", 263, 2);
  let sum = 0;
  for (const b of h) sum += b;
  put(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8);
  return h;
}

function paxRecord(key: string, value: string): string {
  const body = ` ${key}=${value}\n`;
  let len = enc.encode(body).length + 1;
  while (String(len).length + enc.encode(body).length !== len) len++;
  return `${len}${body}`;
}

function pad(data: Uint8Array): Uint8Array[] {
  const rest = (512 - (data.length % 512)) % 512;
  return rest ? [data, new Uint8Array(rest)] : [data];
}

/** Builds a tarball that looks like GitHub's: a pax global header and a "<root>/" prefix. */
export class TarBuilder {
  private parts: Uint8Array[] = [];

  constructor(private readonly root = ROOT) {
    const global = enc.encode(paxRecord("comment", SHA));
    this.parts.push(header("pax_global_header", "g", global.length), ...pad(global));
    this.parts.push(header(root, "5", 0));
  }

  raw(name: string, type: string, body: Uint8Array = new Uint8Array(0), linkname = ""): this {
    this.parts.push(header(name, type, body.length, linkname), ...pad(body));
    return this;
  }

  file(path: string, content: string | Uint8Array): this {
    const data = typeof content === "string" ? enc.encode(content) : content;
    const name = this.root + path;
    if (enc.encode(name).length > 100) {
      const pax = enc.encode(paxRecord("path", name));
      this.raw("PaxHeader", "x", pax);
      return this.raw(name.slice(0, 99), "0", data);
    }
    return this.raw(name, "0", data);
  }

  gnuLongName(path: string, content: string): this {
    const name = enc.encode(`${this.root + path}\0`);
    this.raw("././@LongLink", "L", name);
    return this.raw("short-name", "0", enc.encode(content));
  }

  dir(path: string): this {
    return this.raw(`${this.root + path}/`, "5");
  }

  symlink(path: string, target: string): this {
    return this.raw(this.root + path, "2", undefined, target);
  }

  hardlink(path: string, target: string): this {
    return this.raw(this.root + path, "1", undefined, this.root + target);
  }

  fifo(path: string): this {
    return this.raw(this.root + path, "6");
  }

  tar(): Uint8Array {
    const all = [...this.parts, new Uint8Array(1024)];
    const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
    let off = 0;
    for (const p of all) {
      out.set(p, off);
      off += p.length;
    }
    return out;
  }

  build(): Uint8Array {
    return new Uint8Array(gzipSync(this.tar()));
  }
}

export function makeTarball(files: Record<string, string | Uint8Array>): Uint8Array {
  const b = new TarBuilder();
  for (const [path, content] of Object.entries(files)) b.file(path, content);
  return b.build();
}

export async function* chunked(data: Uint8Array, size = 64 * 1024): AsyncGenerator<Uint8Array> {
  for (let i = 0; i < data.length; i += size) yield data.subarray(i, i + size);
}

export async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

function streamOf(data: Uint8Array, size = 16 * 1024): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= data.length) return controller.close();
      controller.enqueue(data.slice(i, i + size));
      i += size;
    },
  });
}

export interface FakeRequest {
  url: URL;
  headers: Headers;
}

type Handler = (url: URL) => Response;

/** Imitates the GitHub endpoints the client uses. */
export class FakeGitHub {
  tarball: Uint8Array = makeTarball({ "README.md": "# demo\n" });
  repo: Record<string, unknown> = {
    full_name: "octo/demo",
    description: "A demo repository",
    size: 10,
    created_at: "2020-01-01T00:00:00Z",
    pushed_at: "2024-01-01T00:00:00Z",
    default_branch: "main",
    private: false,
    stargazers_count: 3,
    forks_count: 1,
    fork: false,
    archived: false,
    owner: { login: "octo", type: "User" },
  };
  user: Record<string, unknown> = { created_at: "2015-05-05T00:00:00Z" };
  releases: unknown[] = [];
  redirectTo = `https://codeload.github.com/octo/demo/legacy.tar.gz/${SHA}`;
  requests: FakeRequest[] = [];
  overrides = new Map<string, Handler>();
  /** The commit's file list (git/trees API); null answers 404. */
  tree: { path: string; type: "blob" | "tree" | "commit"; size: number }[] | null = null;
  treeTruncated = false;
  /** Files served by raw.githubusercontent.com for the commit. */
  rawFiles = new Map<string, string | Uint8Array>();

  handle(url: URL): Response {
    const path = url.pathname;
    const override = this.overrides.get(path);
    if (override) return override(url);
    if (url.hostname === "codeload.github.com") return new Response(streamOf(this.tarball));
    if (url.hostname === "raw.githubusercontent.com") {
      const prefix = `/octo/demo/${SHA}/`;
      const file = path.startsWith(prefix) ? this.rawFiles.get(decodeURIComponent(path.slice(prefix.length))) : undefined;
      if (file === undefined) return new Response("404: Not Found", { status: 404 });
      return new Response(streamOf(typeof file === "string" ? new TextEncoder().encode(file) : file));
    }
    if (path === `/repos/octo/demo/git/trees/${SHA}` && this.tree) {
      return Response.json({ sha: SHA, tree: this.tree, truncated: this.treeTruncated });
    }
    if (path === "/repos/octo/demo") return Response.json(this.repo);
    if (path.startsWith("/repos/octo/demo/commits/")) return new Response(SHA);
    if (path === "/users/octo") return Response.json(this.user);
    if (path === "/repos/octo/demo/releases") return Response.json(this.releases);
    if (path === `/repos/octo/demo/tarball/${SHA}`) {
      return new Response(null, { status: 302, headers: { Location: this.redirectTo } });
    }
    return Response.json({ message: "Not Found" }, { status: 404 });
  }

  fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    this.requests.push({ url, headers: new Headers(init?.headers) });
    if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
    return this.handle(url);
  }) as typeof fetch;
}

/** All files under `dir` with one of the extensions. */
export function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}

export interface ZipFile {
  name: string;
  data?: string | Uint8Array;
  deflate?: boolean;
  encrypted?: boolean;
  symlink?: boolean;
  /** Compression method to declare (default: 8 if deflate, else 0). */
  method?: number;
}

/** A minimal ZIP writer (no CRCs: GitRay does not check them). */
export function makeZip(files: ZipFile[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const le = (n: number, bytes: number) => Array.from({ length: bytes }, (_, i) => Math.floor(n / 256 ** i) % 256);
  for (const f of files) {
    const name = enc.encode(f.name);
    const raw = typeof f.data === "string" ? enc.encode(f.data) : (f.data ?? new Uint8Array(0));
    const body = f.deflate ? new Uint8Array(deflateRawSync(raw)) : raw;
    const method = f.method ?? (f.deflate ? 8 : 0);
    const flags = f.encrypted ? 1 : 0;
    const local = new Uint8Array([
      ...le(0x04034b50, 4), ...le(20, 2), ...le(flags, 2), ...le(method, 2), ...le(0, 4), ...le(0, 4),
      ...le(body.length, 4), ...le(raw.length, 4), ...le(name.length, 2), ...le(0, 2), ...name,
    ]);
    const attrs = f.symlink ? 0xa1ff * 0x10000 : 0x81a4 * 0x10000;
    central.push(new Uint8Array([
      ...le(0x02014b50, 4), 20, 3, ...le(20, 2), ...le(flags, 2), ...le(method, 2), ...le(0, 4), ...le(0, 4),
      ...le(body.length, 4), ...le(raw.length, 4), ...le(name.length, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2),
      ...le(0, 2), ...le(attrs, 4), ...le(offset, 4), ...name,
    ]));
    parts.push(local, body);
    offset += local.length + body.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array([
    ...le(0x06054b50, 4), ...le(0, 2), ...le(0, 2), ...le(files.length, 2), ...le(files.length, 2),
    ...le(cdSize, 4), ...le(offset, 4), ...le(0, 2),
  ]);
  const all = [...parts, ...central, eocd];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of all) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
