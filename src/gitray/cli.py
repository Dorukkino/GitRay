"""Command line interface: python -m gitray github.com/owner/repo

Exit codes: 0 clean, 1 suspicious, 2 dangerous, 3 any error, 4 incomplete
(a limit stopped the scan and the part read was clean). argparse and
uncaught exceptions would otherwise use 2 and 1, which collide with verdicts.
"""

import argparse
import json
import os
import sys
import traceback
from collections import defaultdict
from typing import NoReturn, TextIO

import httpx

from gitray import __version__
from gitray.engine import (
    GitHubClient,
    GitRayError,
    Limits,
    ScanResult,
    Verdict,
    parse_target,
    scan_repo,
)
from gitray.engine.limits import MiB
from gitray.engine.models import Finding
from gitray.engine.report import result_to_dict
from gitray.engine.text import sanitize

EXIT_CODES = {
    Verdict.CLEAN: 0,
    Verdict.SUSPICIOUS: 1,
    Verdict.DANGEROUS: 2,
    Verdict.INCOMPLETE: 4,
}
EXIT_ERROR = 3
MAX_LOCATIONS_PER_RULE = 10


class GitRayArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> NoReturn:
        self.print_usage(sys.stderr)
        self.exit(EXIT_ERROR, f"{self.prog}: error: {message}\n")


def build_parser() -> GitRayArgumentParser:
    p = GitRayArgumentParser(
        prog="gitray",
        description="Scan a public GitHub repository for malicious patterns "
        "without cloning it or running any of its code.",
        epilog="Exit codes: 0 clean, 1 suspicious, 2 dangerous, 3 error, "
        "4 incomplete (a size limit stopped the scan and the part read was clean). "
        "Set GITHUB_TOKEN to raise the GitHub API rate limit.",
    )
    p.add_argument("target", help="github.com/owner/repo, a GitHub URL, or owner/repo")
    p.add_argument("--json", action="store_true", help="print the result as JSON")
    p.add_argument("--debug", action="store_true", help="show tracebacks for errors")
    p.add_argument("--version", action="version", version=f"gitray {__version__}")
    d = Limits()
    p.add_argument("--max-download-mb", type=int, default=d.max_download_bytes // MiB)
    p.add_argument("--max-total-mb", type=int, default=d.max_total_bytes // MiB)
    p.add_argument("--max-files", type=int, default=d.max_files)
    p.add_argument("--max-file-kb", type=int, default=d.max_file_bytes // 1024)
    return p


def main(argv: list[str] | None = None, *, transport: httpx.BaseTransport | None = None) -> int:
    args: argparse.Namespace | None = None
    try:
        args = build_parser().parse_args(argv)
        limits = Limits(
            max_download_bytes=args.max_download_mb * MiB,
            max_total_bytes=args.max_total_mb * MiB,
            max_files=args.max_files,
            max_file_bytes=args.max_file_kb * 1024,
        )
        ref = parse_target(args.target)
        with GitHubClient(os.environ.get("GITHUB_TOKEN"), transport=transport) as client:
            result = scan_repo(ref, client, limits)
        if args.json:
            print(json.dumps(result_to_dict(result), indent=2, ensure_ascii=False))
        else:
            print_report(result, sys.stdout)
        return EXIT_CODES[result.verdict]
    except SystemExit as e:
        # argparse --help / --version exit 0; its errors already exit with EXIT_ERROR.
        return e.code if isinstance(e.code, int) else EXIT_ERROR
    except GitRayError as e:
        print(f"gitray: error: {e}", file=sys.stderr)
        return EXIT_ERROR
    except KeyboardInterrupt:
        print("gitray: interrupted", file=sys.stderr)
        return EXIT_ERROR
    except Exception as e:
        print(f"gitray: unexpected error: {type(e).__name__}", file=sys.stderr)
        if args is not None and args.debug:
            traceback.print_exc()
        return EXIT_ERROR


def print_report(result: ScanResult, out: TextIO) -> None:
    w = out.write
    repo = result.repo
    if repo:
        w(f"GitRay scan of {sanitize(repo.full_name)} @ {repo.head_sha[:12]} ")
        w(f"(branch {sanitize(repo.default_branch)})\n")
    w(f"Verdict: {result.verdict.value.upper()}   Score: {result.score}/100\n")
    s = result.stats
    w(
        f"Scanned {s.files_scanned} files ({s.truncated_files} truncated, "
        f"{s.skipped_binary} binary skipped, {s.skipped_non_regular} links/special skipped)\n"
    )
    if result.partial:
        p = result.partial
        w(
            f"PARTIAL SCAN: limit {p.limit} ({p.limit_value}) exceeded after "
            f"{s.files_scanned} files were scanned; the rest was not read ({p.reason})\n"
        )
    if result.rule_scores:
        breakdown = ", ".join(
            f"{rule_id} +{points}"
            for rule_id, points in sorted(result.rule_scores.items(), key=lambda kv: -kv[1])
        )
        w(f"Score breakdown: {breakdown}\n")

    by_rule: dict[str, list[Finding]] = defaultdict(list)
    for f in result.findings:
        by_rule[f.rule_id].append(f)
    if by_rule:
        w(f"\nFindings ({len(result.findings)}):\n")
    for rule_id, findings in sorted(by_rule.items(), key=lambda kv: -result.rule_scores[kv[0]]):
        first = findings[0]
        w(f"\n[{rule_id}] {first.title}  (+{result.rule_scores[rule_id]})\n")
        w(f"  Why: {first.why}\n")
        for f in findings[:MAX_LOCATIONS_PER_RULE]:
            ctx = "  [documentation]" if f.doc_context else ""
            w(f"  - {sanitize(f.path, 300)}:{f.line}{ctx}\n")
            w(f"      > {sanitize(f.snippet)}\n")
            if f.note:
                w(f"      ({sanitize(f.note)})\n")
        if len(findings) > MAX_LOCATIONS_PER_RULE:
            w(f"  ... and {len(findings) - MAX_LOCATIONS_PER_RULE} more\n")

    if repo:
        w("\nRepository:\n")
        w(f"  created {repo.created_at}, last push {repo.pushed_at or 'unknown'}\n")
        owner_age = repo.owner_created_at or "unknown"
        w(f"  owner {sanitize(repo.owner_login)} ({repo.owner_type}), created {owner_age}\n")
        if repo.release_assets:
            w("  Release assets (not downloaded; digest from GitHub API):\n")
            for a in repo.release_assets:
                digest = sanitize(a.digest) if a.digest else "no digest, could not be checked"
                w(f"    {sanitize(a.release_tag)}/{sanitize(a.name)}: {digest}\n")
