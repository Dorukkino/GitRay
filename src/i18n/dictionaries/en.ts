/**
 * English texts of the site. This object defines the shape every other
 * language must follow (see Dictionary). Rule titles and explanations come from
 * the engine in English, so `rules` is empty here; other languages translate
 * them by rule id.
 */

import type { PluralText } from "../format";

export interface RuleText {
  title: string;
  why: string;
}

export const en = {
  meta: {
    title: "GiTRay: scan a GitHub repo before you clone it",
    description:
      "GiTRay checks public GitHub repositories for malware tricks (install hooks, hidden payloads, " +
      "credential stealers, fake download links) without cloning or running anything.",
  },
  nav: { label: "Main", scan: "Scan", how: "How it works", safeZone: "Safe Zone", scammer: "Scammer", rules: "Rules" },
  footer: {
    note: "GiTRay never clones, builds or runs the code it scans. Results are heuristics, not a guarantee.",
    label: "Site",
    privacy: "Privacy",
    terms: "Terms",
    source: "Source on GitHub",
  },
  theme: { label: "Theme", system: "System", light: "Light", dark: "Dark" },
  language: { label: "Language" },
  logo: "GiTRay home",

  home: {
    weekly: {
      one: "repository scanned in the last week",
      other: "repositories scanned in the last week",
    } as PluralText,
    badge: "{rules} rules · nothing is cloned or executed",
    titleBefore: "Is this GitHub repo ",
    titleHighlight: "safe to clone",
    titleAfter: "?",
    intro:
      "Malware now hides in GitHub repositories: fake tools, cheats and job-interview projects that run code the " +
      "moment you install, build or open them. GiTRay reads the repository the safe way and tells you what it " +
      "found, line by line.",
    panel: {
      title: "X-ray of a fake repository",
      note: "Every file is read, nothing is run.",
      install: "runs on npm install",
      open: "runs when the folder opens",
      program: "program inside the repo",
      hidden: "code pushed off-screen",
      clean: "nothing found",
    },
    recentTitle: "Recently scanned",
    recentAll: "See all",
    looksTitle: "What GiTRay looks for",
    allRules: "All {n} rules",
    verdictsTitle: "Verdicts",
    ranges: {
      clean: "Score below 30",
      suspicious: "Score 30 to 69",
      dangerous: "Score 70 or more",
      incomplete: "A limit stopped the scan",
    },
    disclaimer:
      "GiTRay is a static scanner: it recognises known tricks, it does not run code in a sandbox. A clean result " +
      "lowers the risk; it does not prove a repository is safe.",
  },

  how: {
    metaTitle: "How it works",
    metaDescription:
      "What happens when GiTRay scans a GitHub repository: metadata from the API, an archive read in memory, " +
      "explainable rules and a score. Nothing is cloned or executed.",
    title: "How it works",
    intro:
      "GiTRay answers one question before you clone, install or open a repository: does it use a trick that " +
      "malware is known to use? This is what happens when you press Scan.",
    steps: [
      {
        title: "Metadata, not a clone",
        text:
          "Repository, owner and release details come from the GitHub API. Release files are never downloaded; " +
          "their SHA-256 fingerprints are looked up on VirusTotal.",
      },
      {
        title: "Read in memory, with limits",
        text:
          "The source archive is streamed and unpacked in memory with hard limits on size, file count and time, " +
          "ZIP files inside it included. Files that .gitattributes keeps out of GitHub's archive are fetched " +
          "separately. Nothing is written to disk and nothing is executed.",
      },
      {
        title: "Explainable rules",
        text:
          "Each rule looks for one known trick and explains why it is dangerous. Every finding comes with file, " +
          "line, the exact code and a 0-100 score contribution.",
      },
      {
        title: "A score and a verdict",
        text:
          "Each rule adds its strongest finding once, up to 100. Below 30 is Clean, from 30 Suspicious, from 70 " +
          "Dangerous. When a safety limit stops the scan, the verdict is Incomplete, never Clean.",
      },
    ],
    neverTitle: "What GiTRay never does",
    never: [
      {
        title: "Run code from the repository",
        text: "No install, no build, no scripts, no sandbox. Every file is only read.",
      },
      {
        title: "Write the repository to disk",
        text: "The archive is unpacked in memory with hard limits, so an archive bomb cannot fill a disk.",
      },
      {
        title: "Download release files",
        text: "Only their SHA-256 fingerprints are looked up on VirusTotal. No file is ever uploaded or downloaded.",
      },
      {
        title: "Trust what the repository says",
        text:
          "File names, README text and code are shown with hidden characters made visible and links disarmed. " +
          "Links from the repository are never clickable.",
      },
    ],
    limitsTitle: "Limits",
    limits: [
      "Results are heuristics. A Clean verdict lowers the risk; it does not prove a repository is safe.",
      "Only known tricks are recognised. Brand-new techniques can pass until a rule learns them.",
      "A result covers the scanned commit only. A later commit can change everything.",
      "Git submodules are listed but not scanned, because they come from other repositories.",
      "When a safety limit stops a scan, the result is Incomplete, never Clean.",
    ],
    ctaTitle: "Try it on a repository",
    ctaRules: "See all {n} rules",
  },

  form: {
    label: "GitHub repository",
    placeholder: "https://github.com/owner/repository",
    submit: "Scan repository",
    invalid: "Enter a public GitHub repository, e.g. github.com/owner/repo",
    failed: "Something went wrong",
    try: "Try:",
  },

  categories: {
    dependencies: {
      label: "Malicious dependencies",
      text: "Packages in package.json, lockfiles and Python requirements that OSV lists as confirmed malware.",
    },
    autorun: {
      label: "Runs automatically",
      text:
        "npm install hooks, setup.py, VS Code tasks and settings, dev containers, AI assistant hooks, .npmrc, " +
        "direnv, build events.",
    },
    code: {
      label: "Malicious code patterns",
      text:
        "Decode-and-execute, curl | sh, browser password and cookie theft, SSH keys, crypto wallets, " +
        "Discord/Telegram exfiltration, Windows LOLBins.",
    },
    obfuscation: {
      label: "Hidden or obfuscated content",
      text:
        "Random-looking blobs, Trojan Source bidi characters, code pushed off-screen with whitespace, invisible " +
        "Unicode payloads.",
    },
    links: {
      label: "Download links",
      text:
        "Executables and archives outside the repo's own releases, file-sharing sites, link shorteners, archive " +
        "passwords.",
    },
    social: {
      label: "Social engineering",
      text: 'README instructions to disable antivirus, add exclusions or ignore a "false positive".',
    },
    binary: {
      label: "Binary files",
      text:
        "Committed PE/ELF/Mach-O executables, .lnk shortcuts, password-protected archives, files antivirus engines " +
        "detect. Files inside ZIPs are unpacked in memory and scanned too.",
    },
    repo: {
      label: "Repository signals",
      text: "Brand-new owner accounts, freshly created repositories, and files hidden from GitHub's download archive.",
    },
    ci: {
      label: "CI workflows",
      text: "CI configurations that pipe downloads into a shell (they run on the build server, not your machine).",
    },
  },

  verdicts: {
    clean: {
      label: "Clean",
      summary:
        "No known malware tricks were found. That is not a guarantee: GiTRay looks for known patterns and does not " +
        "run the code.",
    },
    suspicious: {
      label: "Suspicious",
      summary:
        "Some patterns that malware uses were found. Read the findings before you install, build or run anything " +
        "from this repository.",
    },
    dangerous: {
      label: "Dangerous",
      summary:
        "Several strong signs of malware. Do not clone, install, build or open this repository in an IDE unless you " +
        "understand every finding.",
    },
    incomplete: {
      label: "Incomplete",
      summary:
        "A safety limit stopped the scan before every file was read. The part that was read looks clean, but a " +
        "partial scan is never called clean: the payload could be in the unread part.",
    },
  },
  severity: { high: "high", medium: "medium", low: "low" },

  scan: {
    steps: [
      "Reading repository metadata from the GitHub API",
      "Streaming the source archive into memory (never to disk)",
      "Running every rule over every file",
      "Adding up the score",
    ],
    scanning: "Scanning {repo}",
    duration: "Usually 2-20 seconds, depending on the size of the repository.",
    scannedWithCommit: "Scanned {age} for commit {sha}.",
    scanned: "Scanned {age}.",
    justNow: "just now",
    minutesAgo: "{n} min ago",
    hoursAgo: "{n} h ago",
    again: "Scan again now",
    couldNot: "Could not scan {repo}",
    tryAgain: "Try again",
    another: "Scan another repository",
    httpFailed: "The scan failed (HTTP {status}).",
    network: "Network error",
    details: "Details: {text}",
    /** Translated error messages by code; English shows the server's own message. */
    errorMessages: {} as Record<string, string>,
    errorHelp: {
      not_found: "Check the spelling. Private repositories cannot be scanned.",
      private: "Only public repositories can be scanned.",
      rate_limited: "Too many scans in a short time. Wait a minute and try again.",
      busy: "The scanner is busy. Try again in a few seconds.",
      budget_exhausted:
        "This limit protects the GitHub API quota that every visitor shares. Try again within the hour.",
      invalid_target: "Use the form github.com/owner/repository.",
    } as Record<string, string>,
  },

  report: {
    limits: {
      maxRepoSizeKb: "repository size",
      maxDownloadBytes: "download size",
      maxEntries: "number of files",
      maxFileBytes: "file size",
      maxTotalBytes: "unpacked size",
      timeBudgetMs: "time budget",
      maxHiddenFiles: "hidden files",
    } as Record<string, string>,
    checks: {
      dependencies: "Malicious dependencies (OSV)",
      reputation: "Antivirus engines (VirusTotal)",
      hidden: "Files hidden from the download",
    },
    dependency: {
      older: "Not checked: this report is older than the dependency check. Scan again to include it.",
      packages: { one: "{n} package", other: "{n} packages" } as PluralText,
      ok: "Checked {packages} against OSV's list of known malicious packages: none found.",
      found: "{malicious} of {packages} declared here are known malware according to OSV.",
      unavailable: "OSV could not be reached, so dependencies were not checked against known malware.",
      none: "No dependency files (package.json, requirements.txt, pyproject.toml or lockfiles), so there was nothing to check.",
      notCheckedPartial: "Not checked, because the scan stopped early.",
      notChecked: "Not checked.",
    },
    reputation: {
      older: "Not checked: this report is older than the VirusTotal check. Scan again to include it.",
      files: { one: "{n} file", other: "{n} files" } as PluralText,
      unknown: {
        one: "{n} is unknown to VirusTotal, which does not mean safe.",
        other: "{n} are unknown to VirusTotal, which does not mean safe.",
      } as PluralText,
      more: {
        one: "{n} more file was not looked up (at most 10 per scan).",
        other: "{n} more files were not looked up (at most 10 per scan).",
      } as PluralText,
      found: "Antivirus engines flag {flagged} of {files} looked up by fingerprint.",
      ok: "Looked up {files} by fingerprint: no antivirus engine flags them.",
      partial:
        "Looked up {looked} of {files}; the rest wait for VirusTotal's shared quota (4 a minute, 500 a day) and are " +
        "looked up when the repository is scanned again.",
      unavailable: "VirusTotal could not be reached, so programs and release files were not looked up.",
      notConfigured: "Not looked up automatically on this site. Use the VirusTotal links next to the release files.",
      none: "Nothing to look up: no programs in the repository and no release files.",
      detects: "{bad}/{total} engines detect it",
      unknownFile: "unknown to VirusTotal",
      reasons: {
        error: "lookup failed",
        quota: "not looked up yet (shared quota)",
        limit: "not looked up (10 per scan)",
      },
      releaseFile: "release file",
      inRepository: "in the repository",
      link: "VirusTotal",
    },
    archive: {
      ok: "GitHub's download archive holds every file of this commit.",
      hidden: {
        one:
          "{n} file is left out of GitHub's download archive (.gitattributes export-ignore) but still arrives with " +
          "git clone. GiTRay downloaded and scanned {scanned} of them separately.",
        other:
          "{n} files are left out of GitHub's download archive (.gitattributes export-ignore) but still arrive with " +
          "git clone. GiTRay downloaded and scanned {scanned} of them separately.",
      } as PluralText,
      unavailable:
        "GitHub did not return the commit's full file list, so files hidden from the download archive could not be checked.",
    },
    submodules: {
      count: {
        one: "{n} git submodule is not scanned.",
        other: "{n} git submodules are not scanned.",
      } as PluralText,
      text: "GitHub's download leaves them out, but {command} downloads them from other repositories. Scan them before cloning that way.",
      from: "from {url}",
      scan: "scan {repo}",
    },
    age: {
      unknown: "unknown",
      today: "today",
      days: { one: "{n} day ago", other: "{n} days ago" } as PluralText,
      months: "{n} months ago",
      years: "{n} years ago",
    },
    stats: {
      commit: "Commit",
      branch: "Branch",
      repoCreated: "Repo created",
      ownerSince: "Owner since",
      starsForks: "Stars / forks",
      filesScanned: "Files scanned",
    },
    line: {
      rules: "{n} rules",
      sizes: "{downloaded} downloaded, {unpacked} unpacked in memory",
      binaries: "{n} binary files inspected by header only",
      zips: {
        one: "{members} files read from inside {n} ZIP archive",
        other: "{members} files read from inside {n} ZIP archives",
      } as PluralText,
      zipsSkipped: "{n} ZIP archives too large to open",
      seconds: "{s} s",
      scannedAt: "scanned {date}",
    },
    partialScan: "Partial scan",
    partialBox:
      "{title} The {limit} limit stopped the scan ({reason}) after {files} files. Attackers can hide a payload behind " +
      "large files, so a partial scan is never reported as clean.",
    partialTitle: "Partial scan.",
    heldTitle: "Held at Suspicious.",
    heldText:
      "Most of the score comes from test files (tests/, spec/, fixtures/). Test code does not run when you clone or " +
      "install a repository, and security tools keep attack samples there, so on their own these findings make a " +
      "repository at most Suspicious. Nothing in this repository runs by itself on install or when opened; if " +
      'something did, the full score would count. Check the findings marked "in a test file" before running the tests.',
    scanResult: "Scan result",
    metadata: "Repository metadata",
    inDocs: "in documentation, weight reduced",
    inPattern: "in a search pattern or comment, weight reduced",
    inZip: "inside a ZIP file",
    inTest: "in a test file",
    viewOnGitHub: "view on GitHub",
    whyMatters: "Why this matters",
    breakdownTitle: "Score breakdown",
    noRule: "No rule matched. Score 0.",
    findingCount: { one: "{n} finding", other: "{n} findings" } as PluralText,
    breakdownNote:
      "Each rule adds its strongest finding once; the total is capped at 100. Clean below 30, suspicious from 30, " +
      "dangerous from 70.",
    findingsTitle: "Findings",
    all: "All",
    anySeverity: "Any severity",
    nothing:
      "Nothing to report. GiTRay checked install hooks, build files, code patterns, hidden content, links and binaries.",
    noMatch: "No findings match the filters.",
    omitted: "{n} weaker findings are not listed to keep the report readable; they do not change the score.",
    releasesTitle: "Release files",
    releasesIntro:
      "Release files are never downloaded. GitHub reports a SHA-256 digest for newer uploads; you can look it up on " +
      "VirusTotal. Without a digest the file cannot be checked.",
    columns: { release: "Release", file: "File", size: "Size", sha256: "SHA-256" },
    checkOnVirusTotal: "check on VirusTotal",
    noDigest: "no digest: cannot be checked",
    rawTitle: "Raw JSON report",
    download: "Download",
    gaugeLabel: "Risk score {score} out of 100",
    gaugeSuffix: "/ 100 risk",
  },

  lists: {
    score: "score {n}",
    commit: "commit {sha}",
    findings: { one: "{n} finding", other: "{n} findings" } as PluralText,
    stars: { one: "{n} star", other: "{n} stars" } as PluralText,
    dbTitle: "The database is not connected yet.",
    dbText:
      "Scans still work, but nothing is stored. Add a Postgres database (Neon) in the Vercel project's Storage tab to " +
      "fill this list.",
    failed: "The list could not be loaded right now. Try again in a minute.",
  },

  safeZone: {
    metaTitle: "Safe Zone",
    metaDescription: "Recently scanned GitHub repositories where GiTRay found no known malware tricks.",
    eyebrow: "Safe Zone",
    title: "Recently scanned, nothing found",
    intro:
      "The latest {n} repositories whose most recent scan came back {clean} (score below 30, every file read). A " +
      "repository leaves this list as soon as a new scan finds something.",
    clean: "clean",
    note:
      "Clean means GiTRay found none of the tricks it knows. It is not a guarantee that a repository is safe, and it " +
      "only covers the commit that was scanned.",
    empty: "No clean scans yet. {link} to add one.",
    emptyLink: "Scan a repository",
  },

  scammer: {
    metaTitle: "Scammer list",
    metaDescription: "Recently scanned GitHub repositories that GiTRay rated dangerous.",
    eyebrow: "Scammer list",
    title: "Repositories rated dangerous",
    intro:
      "The latest {n} repositories whose most recent scan scored {score}: several strong signs of malware, such as " +
      "install scripts that download payloads, credential stealing or fake download links. Do not clone, install or " +
      "open them.",
    score: "70 or more",
    warning:
      "This list is produced automatically by heuristics, not by a person. Security tools and malware research " +
      "repositories can land here because they contain the very patterns GiTRay looks for. Open a repository to see " +
      "every finding and why it counts. If a repository is listed by mistake, rescan it after a fix or {link}.",
    report: "report a false positive",
    empty: "No dangerous repositories found yet. Repositories that score 70 or more appear here.",
  },

  recent: {
    metaTitle: "Recent scans",
    metaDescription: "The GitHub repositories GiTRay scanned most recently, with their verdicts.",
    eyebrow: "Recent scans",
    title: "Recently scanned repositories",
    intro:
      "The latest {n} repositories scanned on GiTRay, whatever the verdict. Each repository appears once, with its " +
      "most recent scan; open one to see every finding.",
    empty: "No scans yet. {link} to add one.",
    emptyLink: "Scan a repository",
  },

  rulesPage: {
    metaDescription: "Every rule GiTRay runs, what it looks for and how much it weighs.",
    title: "Rules",
    intro:
      "GiTRay runs {count} rules over every file of the repository. A rule adds its weight to the score once, using " +
      "its strongest finding. The total is capped at 100: below {suspicious} is clean, from {suspicious} suspicious, " +
      "from {dangerous} dangerous. Some rules raise their weight for stronger evidence (for example an install " +
      "script that also downloads something). Code rules weigh less inside documentation, where commands are " +
      "usually examples, and inside search patterns and comments in source code, which never run: security tools " +
      "describe attacks this way.",
    ignoredInDocs: "ignored in docs, search patterns and comments",
    inDocs: "+{n} in docs, search patterns and comments",
    files: "files: {list}",
  },

  privacy: {
    metaTitle: "Privacy",
    metaDescription: "What GiTRay stores, what it sends to other services and what it never collects.",
    title: "Privacy policy",
    updated: "Last updated: {date}",
    intro:
      "GiTRay is a free, non-commercial, open-source project. It has no accounts, no analytics, no advertising and " +
      "no tracking. This page lists everything the site keeps or passes on, and why.",
    sections: [
      {
        title: "What you send us",
        paragraphs: [
          "The address of the repository you want scanned. It is used to scan that public repository and is stored " +
            "with the result (see below), never together with anything about you.",
          "Like every website, your browser sends your IP address with each request. GiTRay uses it only to limit " +
            "how many scans one visitor can start (6 a minute). The server holds it briefly in memory for this; the " +
            "database never stores the address itself, only a keyed hash (HMAC) of it with a counter, and deletes " +
            "these counters after about a day. " +
            "Your IP address is not written to GiTRay's logs and is never sent to the services listed below.",
        ],
      },
      {
        title: "Scan results are public",
        paragraphs: [
          "The latest scan of each repository is stored: the repository's name, description, star count, commit, " +
            "verdict, score and the findings, with short excerpts of the repository's files. Anyone can see these " +
            "results on the scan page and in the public lists (Recent scans, Safe Zone, Scammer). Nothing about who " +
            "started a scan is stored with it. At most 5,000 results are kept; the oldest are deleted first.",
        ],
      },
      {
        title: "Cookies and browser storage",
        paragraphs: [
          "GiTRay sets no tracking or advertising cookies, so there is no cookie banner. There are two small " +
            "preferences, and both are only saved when you change them yourself:",
          "{lang}: the language you picked in the language menu, so the site opens in it next time (one year).",
          "{theme}: the theme you picked (light or dark). It stays in your browser's local storage and is never " +
            "sent to the server. Choosing System removes it.",
        ],
      },
      {
        title: "Services that take part in a scan",
        paragraphs: [
          "During a scan GiTRay's server contacts the following services. They receive information about the scanned " +
            "repository, never about you:",
          "GitHub: the repository's details and files are read from GitHub's API and download servers.",
          "OSV (osv.dev): the names and versions of the packages the repository depends on, to look for known " +
            "malicious packages.",
          "VirusTotal: only SHA-256 fingerprints of programs and release files. No file is uploaded.",
          "Links to GitHub and VirusTotal on a report take you to those sites, where their own privacy policies apply.",
        ],
      },
      {
        title: "Hosting",
        paragraphs: [
          "The site runs on {vercel}, and scan results and the rate-limit counters are kept in a Postgres database " +
            "at {neon}. Vercel may keep standard request logs, which include IP addresses, under its own policy. " +
            "Fonts and scripts are served from this site; no third-party scripts are loaded in your browser.",
        ],
      },
      {
        title: "Questions and removal requests",
        paragraphs: [
          "For a question about this policy, or if you own a repository and want its stored result deleted, open an " +
            "issue on {issues}. A stored result can be deleted, but anyone can scan a public repository again later, " +
            "which stores a new result.",
          "If this policy changes, the date at the top changes with it.",
        ],
      },
    ],
  },

  terms: {
    metaTitle: "Terms of use",
    metaDescription: "The terms for using GiTRay and how to read its results.",
    title: "Terms of use",
    updated: "Last updated: {date}",
    intro:
      "By using GiTRay you agree to these terms. They are short because the service is simple: it is free, it has " +
      "no accounts, and it only reads public GitHub repositories.",
    sections: [
      {
        title: "The service",
        paragraphs: [
          "GiTRay is a free, non-commercial, open-source project, provided as it is and as long as it is available. " +
            "It can change, slow down or stop at any time, without notice.",
        ],
      },
      {
        title: "How to read the results",
        paragraphs: [
          "Results are produced automatically by rules that look for known malware tricks. They are not a security " +
            "audit and not a guarantee. A Clean verdict does not prove that a repository is safe, and GiTRay does not " +
            "run the code it scans.",
          "A Dangerous verdict or a place on the Scammer list is an automated assessment of the files in one commit. " +
            "It is not a statement about the people behind a repository, and it can be wrong: security tools and " +
            "malware research often contain the very patterns GiTRay looks for. Read the findings, and report a false " +
            "positive on {issues}.",
          "You decide what you clone, install or run, and you are responsible for that decision.",
        ],
      },
      {
        title: "Repositories and their content",
        paragraphs: [
          "Only public GitHub repositories can be scanned. Their content belongs to their owners. Reports show short " +
            "excerpts of files, made harmless and linked to the original on GitHub, only to explain a finding.",
        ],
      },
      {
        title: "Fair use",
        paragraphs: [
          "GiTRay shares a limited GitHub and VirusTotal quota between all visitors, so scans are limited per visitor " +
            "and per hour. Do not scan in bulk with scripts, try to get around the limits, or attack, overload or " +
            "probe the service. The JSON API at /api/scan can be used for personal, non-commercial use within the " +
            "same limits. Found a security problem in GiTRay itself? Please report it privately as described in " +
            "{security}.",
        ],
      },
      {
        title: "Liability",
        paragraphs: [
          "To the extent the law allows, GiTRay and its maintainer accept no liability for any damage that results " +
            "from using the site or relying on its results, including a repository that turns out to be malicious " +
            "after a Clean verdict.",
        ],
      },
      {
        title: "Source code and changes",
        paragraphs: [
          "The source code is available on {source} under the MIT license. These terms can change; the date at the " +
            "top shows the latest version. Questions go to {issues}.",
        ],
      },
    ],
  },

  notFound: {
    title: "Page not found",
    text: "That is not a page, or not a valid GitHub repository address.",
    link: "Scan a repository",
  },

  /** Rule titles and explanations by rule id; English uses the engine's own texts. */
  rules: {} as Record<string, RuleText>,
};

export type Dictionary = typeof en;
