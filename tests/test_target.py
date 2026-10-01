import pytest

from gitray.engine import InvalidTarget, RepoRef, parse_target


@pytest.mark.parametrize(
    "raw",
    [
        "octo/demo",
        "github.com/octo/demo",
        "https://github.com/octo/demo",
        "http://www.github.com/octo/demo/",
        "https://github.com/octo/demo.git",
        "  GitHub.com/octo/demo  ",
    ],
)
def test_valid_targets(raw: str) -> None:
    assert parse_target(raw) == RepoRef("octo", "demo")


def test_repo_names_with_dots_and_dashes() -> None:
    assert parse_target("github.com/my-org/my.repo_x") == RepoRef("my-org", "my.repo_x")


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "octo",
        "gitlab.com/octo/demo",
        "https://evil.example/octo/demo",
        "https://github.com.evil.example/octo/demo",
        "github.com/octo/demo/tree/main",
        "github.com/../etc",
        "github.com/octo/..",
        "github.com/-octo/demo",
        "octo/demo?x=1",
        "octo/de mo",
        "file:///etc/passwd",
    ],
)
def test_invalid_targets(raw: str) -> None:
    with pytest.raises(InvalidTarget):
        parse_target(raw)
