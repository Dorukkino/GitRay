import httpx
import pytest

from gitray.engine import GitHubClient, GitHubError, Limits, RepoRef, Verdict, scan_repo
from gitray.engine.models import DigestStatus
from tests.conftest import SHA, FakeGitHub

REF = RepoRef("octo", "demo")


def client(fake: FakeGitHub, token: str | None = None) -> GitHubClient:
    return GitHubClient(token, transport=fake.transport())


def test_fetch_repo_info(fake_github: FakeGitHub) -> None:
    fake_github.releases = [
        {
            "tag_name": "v1",
            "assets": [
                {"name": "tool.zip", "size": 10, "digest": "sha256:" + "a" * 64},
                {"name": "old.exe", "size": 20, "digest": None},
            ],
        }
    ]
    info = client(fake_github).fetch_repo_info(REF)
    assert info.full_name == "octo/demo"
    assert info.head_sha == SHA
    assert info.owner_created_at == "2015-05-05T00:00:00Z"
    statuses = [a.digest_status for a in info.release_assets]
    assert statuses == [DigestStatus.AVAILABLE, DigestStatus.UNAVAILABLE]


def test_release_assets_are_never_downloaded(fake_github: FakeGitHub) -> None:
    fake_github.releases = [
        {
            "tag_name": "v1",
            "assets": [
                {
                    "name": "tool.exe",
                    "size": 1,
                    "digest": None,
                    "browser_download_url": "https://github.com/octo/demo/releases/download/v1/tool.exe",
                }
            ],
        }
    ]
    scan_repo(REF, client(fake_github))
    assert not any("releases/download" in str(r.url) for r in fake_github.requests)


def test_private_repo_rejected(fake_github: FakeGitHub) -> None:
    fake_github.repo["private"] = True
    with pytest.raises(GitHubError, match="public"):
        client(fake_github).fetch_repo_info(REF)


def test_not_found(fake_github: FakeGitHub) -> None:
    with pytest.raises(GitHubError, match="not found"):
        client(fake_github).fetch_repo_info(RepoRef("octo", "missing"))


def test_rate_limit_message(fake_github: FakeGitHub) -> None:
    fake_github.overrides["/repos/octo/demo"] = lambda r: httpx.Response(
        403, headers={"x-ratelimit-remaining": "0"}
    )
    with pytest.raises(GitHubError, match="rate limit"):
        client(fake_github).fetch_repo_info(REF)


def test_bad_sha_rejected(fake_github: FakeGitHub) -> None:
    fake_github.overrides["/repos/octo/demo/commits/main"] = lambda r: httpx.Response(
        200, text="../../etc"
    )
    with pytest.raises(GitHubError, match="SHA"):
        client(fake_github).fetch_repo_info(REF)


def test_token_sent_to_api_but_not_to_codeload(fake_github: FakeGitHub) -> None:
    scan_repo(REF, client(fake_github, token="secret-token"))
    api = [r for r in fake_github.requests if r.url.host == "api.github.com"]
    codeload = [r for r in fake_github.requests if r.url.host == "codeload.github.com"]
    assert api and all(r.headers["Authorization"] == "Bearer secret-token" for r in api)
    assert codeload and all("Authorization" not in r.headers for r in codeload)


@pytest.mark.parametrize(
    "location",
    [
        "https://evil.example/x.tar.gz",
        "http://codeload.github.com/x.tar.gz",
        "https://codeload.github.com.evil.example/x",
        "",
    ],
)
def test_redirect_to_unexpected_host_rejected(fake_github: FakeGitHub, location: str) -> None:
    fake_github.redirect_to = location
    with pytest.raises(GitHubError, match="unexpected host"):
        scan_repo(REF, client(fake_github))
    assert all(
        r.url.host in {"api.github.com", "codeload.github.com"} for r in fake_github.requests
    )


def test_repo_size_limit_gives_incomplete_without_download(fake_github: FakeGitHub) -> None:
    fake_github.repo["size"] = 10_000_000
    result = scan_repo(REF, client(fake_github))
    assert result.verdict == Verdict.INCOMPLETE
    assert result.repo is not None and result.repo.full_name == "octo/demo"
    assert result.partial is not None
    assert result.partial.limit == "max_repo_size_kb"
    assert result.stats.files_scanned == 0
    assert not any("tarball" in r.url.path for r in fake_github.requests)


def test_content_length_over_limit_gives_incomplete(fake_github: FakeGitHub) -> None:
    fake_github.overrides["/octo/demo/legacy.tar.gz/" + SHA] = lambda r: httpx.Response(
        200, headers={"Content-Length": str(10**12)}, content=iter([b""])
    )
    result = scan_repo(REF, client(fake_github), Limits())
    assert result.verdict == Verdict.INCOMPLETE
    assert result.partial is not None and result.partial.limit == "max_download_bytes"
    assert result.repo is not None
    assert result.stats.files_scanned == 0


@pytest.mark.network
def test_real_github_smoke() -> None:
    with GitHubClient() as c:
        result = scan_repo(RepoRef("octocat", "Hello-World"), c)
    assert result.complete


def _moved(fake: FakeGitHub, location: str) -> None:
    fake.overrides["/repos/octo/old-name"] = lambda r: httpx.Response(
        301, headers={"Location": location}
    )
    fake.overrides["/repositories/42"] = lambda r: httpx.Response(200, json=fake.repo)


def test_renamed_repo_redirect_is_followed_within_api(fake_github: FakeGitHub) -> None:
    _moved(fake_github, "https://api.github.com/repositories/42")
    result = scan_repo(RepoRef("octo", "old-name"), client(fake_github))
    assert result.repo is not None and result.repo.full_name == "octo/demo"
    assert result.complete
    # Later calls use the canonical name, not the old one.
    paths = [r.url.path for r in fake_github.requests]
    assert paths.count("/repos/octo/old-name") == 1
    assert any(p.startswith("/repos/octo/demo/commits/") for p in paths)


@pytest.mark.parametrize(
    "location",
    ["https://evil.example/repositories/42", "http://api.github.com/repositories/42", ""],
)
def test_redirect_outside_api_gives_clear_message(fake_github: FakeGitHub, location: str) -> None:
    _moved(fake_github, location)
    with pytest.raises(GitHubError, match="moved or renamed"):
        client(fake_github).fetch_repo_info(RepoRef("octo", "old-name"))
    assert all(r.url.host == "api.github.com" for r in fake_github.requests)


def test_redirect_loop_is_bounded(fake_github: FakeGitHub) -> None:
    fake_github.overrides["/repos/octo/loop"] = lambda r: httpx.Response(
        301, headers={"Location": "https://api.github.com/repos/octo/loop"}
    )
    with pytest.raises(GitHubError, match="moved or renamed"):
        client(fake_github).fetch_repo_info(RepoRef("octo", "loop"))
    assert len(fake_github.requests) <= 4
