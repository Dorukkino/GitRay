# GitRay

**Is this GitHub repo safe to clone?** GitRay scans public GitHub repositories for the tricks malware repos use, without cloning, building or running anything.

Malware increasingly ships inside GitHub repositories: fake tools and game cheats whose README links to a password-protected archive, "take-home test" projects whose VS Code task runs when the folder is opened, packages whose install script downloads a payload. GitRay reads the repository the safe way and explains what it found, line by line.

## What it checks

27 rules in 8 categories (full list on the `/rules` page):

| Category | Examples |
| --- | --- |
| Runs automatically | npm `postinstall`, `setup.py`, VS Code `folderOpen` tasks, Visual Studio build events, Rust `build.rs` |
| Malicious code patterns | decode-and-exec, `curl \| sh`, browser password and cookie stores, SSH keys, crypto wallets, Discord/Telegram exfiltration, Windows LOLBins |
| Hidden content | high-entropy blobs, Trojan Source bidi characters, code pushed off-screen with whitespace, invisible Unicode payloads |
| Links and social engineering | executables outside the repo's own releases, file-sharing sites, link shorteners, archive passwords, "disable your antivirus" |
| Binary files | committed PE/ELF/Mach-O executables, `.lnk` shortcuts, encrypted archives |
| Repository signals | brand-new accounts and repositories (weak signals) |

Each rule adds its strongest finding once to a 0-100 score: **clean** below 30, **suspicious** from 30, **dangerous** from 70. When a safety limit stops the scan, the result is **incomplete**, never clean.

The latest result of every scanned repository is stored. Clean repositories are listed in the **Safe Zone**, dangerous ones in the **Scammer** list (automated results, with a link to report false positives).

## How it works

1. Repository metadata, owner age and release digests come from the GitHub API. Release files are never downloaded; their SHA-256 can be looked up on VirusTotal.
2. The source tarball is streamed and unpacked **in memory** with hard limits (download size, unpacked size, file count, bytes per file, time). Nothing touches the disk, links are never followed and nothing is executed.
3. Every text file goes through the text rules; binary files are identified by their header bytes only.
4. The report is sanitized (hidden characters revealed, URLs defanged) before the UI shows it.

## Run it

Requires Node.js 22+.

```bash
npm install
npm run dev                    # http://localhost:3000
npm run scan -- owner/repo     # command-line scan (--json for JSON)
npm run check                  # lint, typecheck, tests
```

Optional settings in `.env.local` (see `.env.example`):

- `GITHUB_TOKEN`: fine-grained token with read-only access to public repositories. Raises the GitHub API limit from 60 to 5,000 requests per hour (a new scan uses 5; a result stored in the last hour uses none).
- `DATABASE_URL`: Postgres connection string (Neon). Without it, scans work but nothing is stored and the lists stay empty.

### Deploy to Vercel

1. Import the repository on vercel.com (framework: Next.js, no extra settings) and add `GITHUB_TOKEN` as an environment variable.
2. In the project's Storage tab, create a Neon Postgres database (free plan) and connect it to the project; Vercel adds `DATABASE_URL`. The table is created on first use.
3. Redeploy.

## API

`GET /api/scan?repo=owner/name` returns the JSON report (`schemaVersion: 1`). A result stored in the last hour is returned unless `&fresh=1` is added. Errors: `{ "error": { "code", "message" } }` with HTTP 400, 403, 404, 422, 429, 502 or 503.

## Project layout

- `src/engine/`: the scanning engine (pure TypeScript, Node built-ins only)
- `src/app/`, `src/components/`: Next.js site and API
- `src/lib/`: API service (cache, rate limit) and Postgres store
- `src/cli.ts`: command-line scanner
- `tests/`: Vitest tests and harmless rule fixtures

Project rules and architecture: [`CLAUDE.md`](CLAUDE.md). Progress log: [`PROGRESS.md`](PROGRESS.md) (both in Turkish).

## Limitations

GitRay is a static, pattern-based scanner. It recognises known tricks; it does not run code in a sandbox, so a clean result lowers the risk but does not prove a repository is safe.

## License

MIT
