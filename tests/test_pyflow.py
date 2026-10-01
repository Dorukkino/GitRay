"""Static data flow for setup.py. Sources here are harmless strings; nothing is run."""

import warnings

import pytest

from gitray.engine import limits, pyflow
from gitray.engine.models import FileEntry
from gitray.engine.pyflow import FlowKind
from gitray.engine.rules import get_rule


def kinds(source: str) -> set[FlowKind]:
    result = pyflow.analyze(source)
    assert result is not None and not result.incomplete
    return {h.kind for h in result.hits}


def test_invalid_python_returns_none() -> None:
    assert pyflow.analyze('print "python 2"\n') is None
    assert pyflow.analyze("x = 1\0\n") is None


def test_oversized_source_is_incomplete() -> None:
    result = pyflow.analyze("x = 1\n" * (limits.MAX_AST_SOURCE_CHARS // 6 + 1))
    assert result is not None and result.incomplete


def test_deeply_nested_source_is_incomplete_not_a_crash() -> None:
    result = pyflow.analyze("x = " + " + ".join(['"a"'] * 5000) + "\n")
    assert result is not None and result.incomplete


def test_self_growing_value_settles() -> None:
    source = 'import subprocess\nv = "1.0"\nfor p in parts:\n    v = v + "." + p\n'
    source += 'subprocess.run(["git", "tag", v])\n'
    assert kinds(source) == {FlowKind.PROCESS}


def test_syntax_warnings_from_scanned_code_are_silenced() -> None:
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        pyflow.analyze('import re\nre.compile("\\d+")\n')
    assert caught == []


def test_tool_names_outside_process_calls_do_not_count() -> None:
    source = (
        "import subprocess\n"
        "# needs curl\n"
        'print("curl and wget are optional")\n'
        'libraries = ["curl"]\n'
        'subprocess.check_call(["make"])\n'
    )
    assert kinds(source) == {FlowKind.PROCESS}


@pytest.mark.parametrize(
    "source",
    [
        'import subprocess as sp\nsp.run(["curl", "x"])\n',
        'from os import popen\npopen("wget x")\n',
        'import os\ncmd = ["iwr"]\ncmd.append("x")\nos.execvp(cmd[0], cmd)\n',
        'import subprocess\ndef sh(c):\n    subprocess.run(c)\nsh("curl x")\n',
        "import subprocess\nclass B:\n    def go(self, c):\n        subprocess.run(c)\n"
        '    def run(self):\n        self.go(["wget", "x"])\n',
        'import subprocess\nrun = lambda c: subprocess.run(c)\nrun(["curl", "x"])\n',
        'import subprocess\nsubprocess.run("lruc"[::-1] + " x", shell=True)\n',
        'import subprocess\nsubprocess.run(" ".join(["cu" "rl", "x"]), shell=True)\n',
        'import subprocess\nsubprocess.run("%s x" % "wget", shell=True)\n',
        'import subprocess\nsubprocess.run("{} x".format("curl"), shell=True)\n',
        'import os, threading\nthreading.Thread(target=os.system, args=("curl x",)).start()\n',
        'import functools, subprocess\nfunctools.partial(subprocess.run, ["curl", "x"])()\n',
        'import subprocess\nsubprocess.run(["python", "-m", "pip", "install", "https://x"])\n',
        'import sys\nsys.modules["subprocess"].run(["curl", "x"])\n',
        'import importlib\nimportlib.import_module("subprocess").run(["wget", "x"])\n',
        "from setuptools import Command\nclass C(Command):\n"
        '    def run(self):\n        self.spawn(["curl", "x"])\n',
    ],
)
def test_download_reaches_process(source: str) -> None:
    assert FlowKind.DOWNLOAD in kinds(source)


def test_file_contents_reaching_process_are_opaque() -> None:
    source = 'import os\nos.system(open("docs/notes.md").read())\n'
    assert kinds(source) == {FlowKind.OPAQUE_DATA}


@pytest.mark.parametrize(
    "source",
    [
        "import os\nf = getattr(os, name)\n",
        "m = __import__(name)\n",
        "import importlib\nm = importlib.import_module(name)\n",
        "exec(code)\n",
        'exec(open("x.py").read())\n',
        "s = chr(99)\n",
        "import base64\nb = base64.b64decode(data)\n",
        'import codecs\ns = codecs.decode(x, "rot13")\n',
        "g = globals()[name]\n",
        "import runpy\nrunpy.run_path(path)\n",
    ],
)
def test_dynamic_constructs(source: str) -> None:
    assert FlowKind.DYNAMIC in kinds(source)


@pytest.mark.parametrize(
    "source",
    [
        'import importlib\nv = importlib.import_module("demo.version")\n',
        'import os\nf = getattr(os, "getcwd")\n',
        "g = getattr(self, name)\n",
        'exec("x = 1")\n',
    ],
)
def test_resolvable_constructs_are_not_dynamic(source: str) -> None:
    assert FlowKind.DYNAMIC not in kinds(source)


def test_capability_includes_imports_only() -> None:
    result = pyflow.analyze("from subprocess import run as r\n")
    assert result is not None and result.can_run_processes
    result = pyflow.analyze("import os\nos.getcwd()\n")
    assert result is not None and not result.can_run_processes


def nest_exec(code: str, levels: int) -> str:
    for _ in range(levels):
        code = f"exec({code!r})"
    return code + "\n"


def test_nested_exec_of_constants_is_analysed() -> None:
    code = "import subprocess\nsubprocess.run(['curl', 'x'])"
    assert FlowKind.DOWNLOAD in kinds(nest_exec(code, limits.MAX_NESTED_EXEC_DEPTH))


def test_exec_beyond_depth_is_dynamic_and_keeps_capability() -> None:
    code = "import subprocess\nsubprocess.run(['curl', 'x'])"
    result = pyflow.analyze(nest_exec(code, limits.MAX_NESTED_EXEC_DEPTH + 1))
    assert result is not None and result.can_run_processes
    assert {h.kind for h in result.hits} == {FlowKind.DYNAMIC}


# -- rule integration -------------------------------------------------------------


def test_rule_flags_complex_file_that_can_run_processes() -> None:
    content = "import subprocess\nx = " + " + ".join(['"a"'] * 5000) + "\n"
    (finding,) = get_rule("GR-AUTO-002").scan(FileEntry(path="setup.py", content=content))
    assert finding.line == 1 and finding.weight == 35
    assert finding.note and "too large or complex" in finding.note


def test_rule_uses_regex_layers_for_truncated_files() -> None:
    content = 'from subprocess import run as r\n# fetched with curl\nr(["make"])\n'
    rule = get_rule("GR-AUTO-002")
    parsed = rule.scan(FileEntry(path="setup.py", content=content))
    truncated = rule.scan(FileEntry(path="setup.py", content=content, truncated=True))
    assert max(f.weight for f in parsed) == 10
    assert [f.line for f in truncated] == [2] and truncated[0].weight == 35
