import Link from "next/link";

import { ScanForm } from "@/components/ScanForm";
import { CATEGORY_LABEL, CATEGORY_ORDER, VERDICT_STYLE } from "@/components/verdict";
import { allRules } from "@/engine";
import type { Category } from "@/engine";

const CATEGORY_TEXT: Record<Category, string> = {
  dependencies: "Packages in package.json, lockfiles and Python requirements that OSV lists as confirmed malware.",
  autorun: "npm install hooks, setup.py, VS Code tasks and settings, dev containers, AI assistant hooks, .npmrc, direnv, build events.",
  code: "Decode-and-execute, curl | sh, browser password and cookie theft, SSH keys, crypto wallets, Discord/Telegram exfiltration, Windows LOLBins.",
  obfuscation: "Random-looking blobs, Trojan Source bidi characters, code pushed off-screen with whitespace, invisible Unicode payloads.",
  links: "Executables and archives outside the repo's own releases, file-sharing sites, link shorteners, archive passwords.",
  social: "README instructions to disable antivirus, add exclusions or ignore a \"false positive\".",
  binary: "Committed PE/ELF/Mach-O executables, .lnk shortcuts, password-protected archives. Files inside ZIPs are unpacked in memory and scanned too.",
  repo: "Brand-new owner accounts, freshly created repositories, and files hidden from GitHub's download archive.",
  ci: "GitHub Actions workflows that pipe downloads into a shell (runs on GitHub, not your machine).",
};

const STEPS = [
  {
    title: "Metadata, not a clone",
    text: "Repository, owner and release details come from the GitHub API. Release files are never downloaded; their SHA-256 digests are shown for VirusTotal lookups.",
  },
  {
    title: "Read in memory, with limits",
    text: "The source archive is streamed and unpacked in memory with hard limits on size, file count and time, ZIP files inside it included. Files that .gitattributes keeps out of GitHub's archive are fetched separately. Nothing is written to disk and nothing is executed.",
  },
  {
    title: "Explainable rules",
    text: "Each rule looks for one known trick and explains why it is dangerous. Every finding comes with file, line, the exact code and a 0-100 score contribution.",
  },
];

export default function Home() {
  const rules = allRules();
  const counts = new Map<Category, number>();
  for (const r of rules) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);

  return (
    <div>
      <section className="relative overflow-hidden border-b border-slate-800/60">
        <div className="bg-grid absolute inset-0" />
        <div className="absolute -top-40 left-1/2 h-80 w-[48rem] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative mx-auto max-w-3xl px-4 pt-20 pb-16 text-center sm:pt-28">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/60 px-3 py-1 text-xs text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {rules.length} rules · nothing is cloned or executed
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-slate-50 sm:text-5xl">
            Is this GitHub repo <span className="bg-gradient-to-r from-cyan-300 to-emerald-300 bg-clip-text text-transparent">safe to clone</span>?
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
            Malware now hides in GitHub repositories: fake tools, cheats and job-interview projects that run code the
            moment you install, build or open them. GitRay reads the repository the safe way and tells you what it
            found, line by line.
          </p>
          <div className="mx-auto mt-9 max-w-2xl text-left">
            <ScanForm autoFocus />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-semibold text-slate-100">How it works</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-400/10 font-mono text-sm text-cyan-300">
                {i + 1}
              </div>
              <h3 className="mt-3 font-semibold text-slate-100">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl font-semibold text-slate-100">What GitRay looks for</h2>
          <Link href="/rules" className="text-sm text-cyan-300 hover:text-cyan-200">
            All {rules.length} rules
          </Link>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORY_ORDER.map((c) => (
            <div key={c} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-100">{CATEGORY_LABEL[c]}</h3>
                <span className="font-mono text-xs text-slate-500">{counts.get(c) ?? 0}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{CATEGORY_TEXT[c]}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <h2 className="text-2xl font-semibold text-slate-100">Verdicts</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          {(
            [
              ["clean", "Score below 30"],
              ["suspicious", "Score 30 to 69"],
              ["dangerous", "Score 70 or more"],
              ["incomplete", "A limit stopped the scan"],
            ] as const
          ).map(([v, range]) => (
            <div key={v} className={`rounded-2xl border border-slate-800 p-5 ${VERDICT_STYLE[v].bg}`}>
              <div className={`font-semibold ${VERDICT_STYLE[v].text}`}>{VERDICT_STYLE[v].label}</div>
              <div className="mt-1 font-mono text-xs text-slate-400">{range}</div>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{VERDICT_STYLE[v].summary}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-slate-500">
          GitRay is a static scanner: it recognises known tricks, it does not run code in a sandbox. A clean result
          lowers the risk; it does not prove a repository is safe.
        </p>
      </section>
    </div>
  );
}
