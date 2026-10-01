"""Display-safe serialization of scan results (used by the CLI, later by the web UI)."""

from dataclasses import asdict
from typing import Any

from gitray.engine.models import Finding, ScanResult
from gitray.engine.text import sanitize

# Paths can be long but must still be sanitized; snippets use the default limit.
PATH_MAX = 300


def finding_to_dict(f: Finding) -> dict[str, Any]:
    return {
        "rule_id": f.rule_id,
        "title": f.title,
        "category": f.category,
        "path": sanitize(f.path, PATH_MAX),
        "line": f.line,
        "snippet": sanitize(f.snippet),
        "why": f.why,
        "weight": f.weight,
        "doc_context": f.doc_context,
        "note": sanitize(f.note) if f.note else None,
    }


def _sanitize_all(value: Any) -> Any:
    if isinstance(value, str):
        return sanitize(value, PATH_MAX)
    if isinstance(value, dict):
        return {k: _sanitize_all(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [_sanitize_all(v) for v in value]
    return value


def result_to_dict(result: ScanResult) -> dict[str, Any]:
    repo = None
    if result.repo is not None:
        # Every repo field comes from GitHub but is user-controlled (branch names,
        # release tags, asset names), so all strings are sanitized.
        repo = _sanitize_all(asdict(result.repo))
        for asset, a in zip(repo["release_assets"], result.repo.release_assets, strict=True):
            asset["digest_status"] = a.digest_status.value
    return {
        "repo": repo,
        "score": result.score,
        "verdict": result.verdict.value,
        "complete": result.complete,
        "partial": (
            {
                "limit": result.partial.limit,
                "limit_value": result.partial.limit_value,
                "reason": result.partial.reason,
                "files_scanned": result.stats.files_scanned,
            }
            if result.partial
            else None
        ),
        "rule_scores": result.rule_scores,
        "stats": asdict(result.stats),
        "findings": [finding_to_dict(f) for f in result.findings],
    }
