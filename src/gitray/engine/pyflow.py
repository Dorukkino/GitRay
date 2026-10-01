"""Static data flow for Python install scripts (setup.py), built on ast.parse.

The source is only parsed, never compiled or run. The analysis is coarse on
purpose: one file, flow-insensitive, names merged across scopes.

Process calls are judged by the role a value plays in them:
- Command position: the program that runs (first list element, after launchers
  such as sudo or env) and command text for a shell (os.system, shell=True,
  sh -c ...). A download tool or URL, file contents, decoded data, or a string
  built from constants in a way the analysis cannot compute is suspicious here.
- Argument position: everything else. Only a URL is suspicious here (a download
  during install); a tool name ("apt-get install curl") or file contents
  ("-DVERSION=" + open("VERSION").read()) are not.
Unknowns from outside the file (environment variables, imported constants,
parameters with no call site) stay neutral. Code the analysis cannot follow
(__import__(x), exec(x), chr(), decoding) is reported as dynamic.
"""

import ast
import itertools
import re
import shlex
import warnings
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, replace
from enum import StrEnum

from gitray.engine import limits

# "curl-config" is a build helper (e.g. pycurl), not a download.
DOWNLOAD_TOOL = re.compile(
    r"\b(?:curl|wget|powershell|pwsh|invoke-webrequest|invoke-restmethod|iwr|irm)\b(?!-config\b)",
    re.IGNORECASE,
)
URL = re.compile(r"https?://", re.IGNORECASE)
# Being able to run processes at all, imports included: an alias such as
# "from subprocess import run as r" hides the call itself.
PROCESS_CAPABILITY = tuple(
    re.compile(p)
    for p in (
        r"\bsubprocess\b",
        r"\bos\.(?:system|popen|exec\w*|spawn\w*)\b",
        r"\bfrom[ \t]+os[ \t]+import[ \t]*(?:\([^)]*?|[^\n]*?)"
        r"\b(?:system|popen|exec\w*|spawn\w*)\b",
    )
)

# Stands in for the part of a string the analysis cannot know; never a word character.
_UNKNOWN_PART = "\x00"
# Quotes, backslashes, carets and backticks split words for a shell (c''url, c\url,
# c^url in cmd.exe) without changing the command; removed before looking for tools.
_SHELL_NOISE = re.compile(r"[\"'\\^`]")


def _os(*names: str) -> frozenset[str]:
    return frozenset(f"os.{n}" for n in names)


# Process functions by how they take their command.
_SHELL_TEXT_FUNCS = frozenset(
    {
        *_os("system", "popen", "popen2", "popen3", "popen4", "startfile"),
        "subprocess.getoutput", "subprocess.getstatusoutput", "commands.getoutput",
        "commands.getstatusoutput", "platform.popen", "asyncio.create_subprocess_shell",
    }
)  # fmt: skip
_ARGV_FUNCS = frozenset(
    {
        "subprocess.run", "subprocess.call", "subprocess.check_call",
        "subprocess.check_output", "subprocess.Popen", "pty.spawn", "distutils.spawn.spawn",
    }
)  # fmt: skip
# create_subprocess_exec(program, *args): the positional arguments are the argv.
_ARGV_AS_ARGS_FUNCS = frozenset({"asyncio.create_subprocess_exec"})
# execl(path, arg0, ...), execv(path, argv), spawnl(mode, path, arg0, ...),
# spawnv(mode, path, argv).
_EXECL = _os("execl", "execle", "execlp", "execlpe")
_EXECV = _os("execv", "execve", "execvp", "execvpe", "posix_spawn", "posix_spawnp")
_SPAWNL = _os("spawnl", "spawnle", "spawnlp", "spawnlpe")
_SPAWNV = _os("spawnv", "spawnve", "spawnvp", "spawnvpe")
PROCESS_FUNCS = (
    _SHELL_TEXT_FUNCS | _ARGV_FUNCS | _ARGV_AS_ARGS_FUNCS | _EXECL | _EXECV | _SPAWNL | _SPAWNV
)
PROCESS_MODULES = frozenset({"subprocess", "pty", "commands", "asyncio.subprocess"})

# ctypes: a loaded C library ("ctypes.lib") can call system(), popen(), exec*() directly.
_CTYPES_LIBRARY = "ctypes.lib"
_CTYPES_LOADERS = frozenset(
    {
        "ctypes.CDLL", "ctypes.PyDLL", "ctypes.WinDLL", "ctypes.OleDLL",
        *(f"ctypes.{d}.LoadLibrary" for d in ("cdll", "pydll", "windll", "oledll")),
    }
)  # fmt: skip
_CTYPES_LIBRARY_LOADERS = frozenset(
    {"ctypes.cdll", "ctypes.pydll", "ctypes.windll", "ctypes.oledll"}
)
_CTYPES_PROCESS = frozenset(
    {
        "system", "popen", "_popen", "_wsystem", "_wpopen", "WinExec", "ShellExecuteA",
        "ShellExecuteW", "CreateProcessA", "CreateProcessW", "execl", "execle", "execlp",
        "execv", "execve", "execvp", "execvpe", "posix_spawn", "posix_spawnp",
    }
)  # fmt: skip

# Programs that run the next argument as the command.
_LAUNCHERS = frozenset(
    {"sudo", "doas", "env", "nohup", "timeout", "xargs", "nice", "ionice", "stdbuf", "setsid",
     "time", "exec", "command"}
)  # fmt: skip
# Launcher options that take a value (sudo -u user, nice -n 5, xargs -I {}).
_LAUNCHER_VALUE_OPTIONS = frozenset({"-u", "-g", "-C", "-h", "-p", "-U", "-r", "-t", "-D", "-n",
                                     "-s", "-k", "-I"})  # fmt: skip
_LAUNCHER_OPTION = re.compile(r"-.*|[A-Za-z_][A-Za-z0-9_]*=.*|\d+(?:\.\d+)?[smhd]?", re.DOTALL)
# Shells, and the flags after which the next argument is command text.
_SHELLS = frozenset(
    {"sh", "bash", "zsh", "dash", "ksh", "fish", "ash", "csh", "tcsh", "busybox", "cmd",
     "powershell", "pwsh"}
)  # fmt: skip
_SHELL_COMMAND_FLAGS = frozenset({"/c", "/k", "-command", "-encodedcommand", "-ec", "-enc", "-e"})
_POSIX_COMMAND_FLAG = re.compile(r"-[a-z]*c[a-z]*")

_IMPORT_FUNCS = frozenset(
    {"builtins.__import__", "importlib.import_module", "importlib.__import__"}
)
_EXEC_FUNCS = frozenset({"builtins.exec", "builtins.eval", "builtins.compile"})
_SCOPE_FUNCS = frozenset({"builtins.globals", "builtins.locals", "builtins.vars"})
# Referencing any of these (called or passed, e.g. map(chr, ...)) builds strings
# the analysis may not see.
_DECODERS = frozenset(
    {
        "b64decode", "b32decode", "b16decode", "b85decode", "a85decode", "urlsafe_b64decode",
        "standard_b64decode", "decodebytes", "decodestring", "unhexlify", "a2b_hex",
        "a2b_base64", "a2b_uu", "fromhex", "decompress", "maketrans",
    }
)  # fmt: skip
# Loading or running another file as code.
_RUN_FILE_ATTRS = frozenset({"exec_module", "load_module", "run_path", "run_module"})
_CODEC_DECODERS = frozenset({"base64", "base_64", "hex", "rot13", "rot_13", "zlib", "zip", "bz2"})
_READ_METHODS = frozenset({"read", "read_text", "read_bytes", "readline", "readlines"})
# Container methods: the result holds what the container holds.
_CONTAINER_METHODS = frozenset({"items", "values", "keys", "copy", "pop", "setdefault"})
_MUTATORS = frozenset({"append", "add", "insert", "extend", "update", "appendleft", "extendleft"})
_PASSTHROUGH_FUNCS = frozenset(
    {
        "shlex.join", "shlex.quote", "os.path.join", "os.path.abspath", "os.path.expanduser",
        "os.path.normpath", "os.fspath", "pathlib.Path", "pathlib.PurePath",
    }
)  # fmt: skip
_BUILTIN_NAMES = frozenset(
    {
        "__import__", "getattr", "exec", "eval", "compile", "execfile", "chr", "globals",
        "locals", "vars", "str", "list", "tuple", "set", "frozenset", "sorted", "reversed",
        "bytes", "bytearray", "map",
    }
)  # fmt: skip

# str methods computed exactly when the receiver and arguments are known constants.
_NO_ARG_METHODS = frozenset({"swapcase", "lower", "upper", "casefold", "title", "capitalize"})
_STR_METHODS = _NO_ARG_METHODS | frozenset(
    {
        "replace", "strip", "lstrip", "rstrip", "removeprefix", "removesuffix", "encode",
        "decode", "split", "rsplit", "splitlines", "partition", "rpartition",
    }
)  # fmt: skip
_PERCENT_SPEC = re.compile(r"%(?:%|[-#0 +]{0,5}\d{0,2}(?:\.\d{0,2})?([diouxXeEfFgGcrsa]))")
_FORMAT_TOKEN = re.compile(r"\{\{|\}\}|\{(\d*)\}|[{}]")
_INTEGER = re.compile(r"-?\d+")


class _NotComputable(Exception):
    pass


def _normalize(s: str) -> str:
    return _SHELL_NOISE.sub("", s)


@dataclass(frozen=True)
class Value:
    """What an expression may hold: strings, or a list/tuple of them."""

    strings: frozenset[str] = frozenset()
    # `strings` holds every possible value (needed to compute or analyse it further).
    exact: bool = False
    # Too many or too long strings were dropped; the dropped_* flags keep their verdict.
    widened: bool = False
    dropped_tool: bool = False
    dropped_url: bool = False
    # Built from data the analysis cannot see: file contents, decoding, chr().
    opaque: bool = False
    # Built from constants by an operation the analysis cannot compute.
    derived: bool = False
    # A list, tuple, set or dict; `strings` then holds its elements' strings.
    seq: bool = False
    # For a list or tuple: its elements in order, when known.
    items: tuple["Value", ...] | None = None
    # For a list or tuple: what its first element may be; None when unknown.
    head: "Value | None" = None

    def has_tool(self) -> bool:
        return self.dropped_tool or any(DOWNLOAD_TOOL.search(_normalize(s)) for s in self.strings)

    def has_url(self, *, in_shell: bool = False) -> bool:
        return self.dropped_url or any(
            URL.search(_normalize(s) if in_shell else s) for s in self.strings
        )

    @property
    def known_strings(self) -> frozenset[str] | None:
        """Every possible string value, or None when they are not all known."""
        if self.exact and self.strings and not self.widened and not self.seq:
            return self.strings
        return None


UNKNOWN = Value()
_BOTTOM = Value(exact=True)
_OPAQUE = Value(opaque=True)


def _widen(v: Value) -> Value:
    return Value(
        widened=True,
        dropped_tool=v.has_tool(),
        dropped_url=v.has_url(in_shell=True),
        opaque=v.opaque,
        derived=v.derived,
        seq=v.seq,
        head=v.head if v.seq else None,
    )


def _bounded(v: Value) -> Value:
    if not v.widened and (
        len(v.strings) > limits.MAX_FLOW_VALUES
        or any(len(s) > limits.MAX_FLOW_STRING_CHARS for s in v.strings)
    ):
        return _widen(v)
    return v


def const(s: str) -> Value:
    return _bounded(Value(frozenset({s}), exact=True))


def _strings(values: Iterable[str]) -> Value:
    return _bounded(Value(frozenset(values), exact=True))


def join(*values: Value) -> Value:
    """Any of the values (union)."""
    vals = [v for v in values if v != _BOTTOM]
    if not vals:
        return _BOTTOM
    if len(vals) == 1:
        return vals[0]
    seq_all = all(v.seq for v in vals)
    heads = [v.head for v in vals]
    head = join(*(h for h in heads if h is not None)) if seq_all and None not in heads else None
    items_list = [v.items for v in vals]
    items = None
    if (
        seq_all
        and None not in items_list
        and len({len(i) for i in items_list if i is not None}) == 1
    ):
        columns = zip(*(i for i in items_list if i is not None), strict=True)
        items = tuple(join(*col) for col in columns)
    if any(v.widened for v in vals):
        return Value(
            widened=True,
            dropped_tool=any(v.has_tool() for v in vals),
            dropped_url=any(v.has_url(in_shell=True) for v in vals),
            opaque=any(v.opaque for v in vals),
            derived=any(v.derived for v in vals),
            seq=any(v.seq for v in vals),
            head=head,
        )
    return _bounded(
        Value(
            strings=frozenset().union(*(v.strings for v in vals)),
            exact=all(v.exact for v in vals),
            opaque=any(v.opaque for v in vals),
            derived=any(v.derived for v in vals),
            seq=any(v.seq for v in vals),
            items=items,
            head=head,
        )
    )


def _element(v: Value) -> Value:
    """Any one element of a list (or the value itself if it is not a list)."""
    return replace(v, seq=False, items=None, head=None)


def _no_structure(v: Value) -> Value:
    return replace(v, seq=True, items=None, head=None)


def sequence(items: Sequence[Value]) -> Value:
    """A list or tuple with known elements in order."""
    flat = join(*(_element(i) for i in items)) if items else _BOTTOM
    return replace(
        flat,
        exact=all(i.exact for i in items),
        seq=True,
        items=tuple(items) if len(items) <= limits.MAX_FLOW_ITEMS else None,
        head=items[0] if items else _BOTTOM,
    )


def _has_head(v: Value) -> bool:
    return bool(v.items) or (v.head is not None and v.head != _BOTTOM)


def concat(left: Value, right: Value) -> Value:
    """left + right."""
    if left.seq and right.seq:
        flat = join(_no_structure(left), _no_structure(right))
        items = None
        if left.items is not None and right.items is not None:
            both = left.items + right.items
            items = both if len(both) <= limits.MAX_FLOW_ITEMS else None
        if left.items == ():
            head = right.head
        elif _has_head(left):
            head = left.head if left.head is not None else None
        else:
            head = None
        return replace(flat, seq=True, items=items, head=head)
    if left.seq or right.seq:
        return _no_structure(join(left, right))
    ls = left.strings or frozenset({_UNKNOWN_PART})
    rs = right.strings or frozenset({_UNKNOWN_PART})
    if left.widened or right.widened or len(ls) * len(rs) > limits.MAX_FLOW_VALUES:
        return Value(
            widened=True,
            dropped_tool=left.has_tool() or right.has_tool(),
            dropped_url=left.has_url(in_shell=True) or right.has_url(in_shell=True),
            opaque=left.opaque or right.opaque,
            derived=left.derived or right.derived,
        )
    return _bounded(
        Value(
            strings=frozenset(a + b for a in ls for b in rs),
            exact=left.exact and right.exact and bool(left.strings) and bool(right.strings),
            opaque=left.opaque or right.opaque,
            derived=left.derived or right.derived,
        )
    )


def _uncomputed(*inputs: Value, seq: bool = False) -> Value:
    """An operation the analysis does not compute. Its strings stay visible; built
    only from constants, the result is marked derived (possibly hiding a command)."""
    v = join(*inputs)
    from_constants = bool(inputs) and all(i.exact and (i.strings or i.items) for i in inputs)
    v = replace(v, exact=False, derived=v.derived or from_constants, items=None, head=None)
    return replace(v, seq=seq)


def _alternatives(values: Sequence[Sequence[object]]) -> list[tuple[object, ...]]:
    combos = 1
    for v in values:
        combos *= len(v)
    if combos > limits.MAX_FLOW_VALUES:
        raise _NotComputable
    return list(itertools.product(*values))


def _from_results(results: Iterable[object]) -> Value:
    values: list[Value] = []
    for r in results:
        if isinstance(r, str):
            values.append(const(r))
        elif isinstance(r, (list, tuple)) and all(isinstance(x, str) for x in r):
            values.append(sequence([const(str(x)) for x in r]))
        else:
            raise _NotComputable
    return join(*values)


def _str_method(name: str, s: str, args: tuple[object, ...]) -> object:
    """A whitelisted str method on constants, with result sizes bounded."""
    if not all(a is None or isinstance(a, (str, int)) for a in args):
        raise _NotComputable
    if name in _NO_ARG_METHODS and args:
        raise _NotComputable
    if name in ("encode", "decode"):
        return s  # Bytes and text are both kept as text.
    if name == "replace":
        if len(args) not in (2, 3) or not all(isinstance(a, str) for a in args[:2]):
            raise _NotComputable
        old, new = str(args[0]), str(args[1])
        count = s.count(old) if old else len(s) + 1
        if len(s) + count * len(new) > limits.MAX_FLOW_STRING_CHARS:
            raise _NotComputable
    result = getattr(s, name)(*args)
    if isinstance(result, list) and len(result) > limits.MAX_FLOW_ITEMS:
        raise _NotComputable
    return result


def _percent_format(fmt: str, args: Sequence[str]) -> str:
    """fmt % args for simple specs (no mapping keys, no '*', widths under 100)."""
    conversions = [m.group(1) for m in _PERCENT_SPEC.finditer(fmt) if m.group(1)]
    if "%" in _PERCENT_SPEC.sub("", fmt) or len(conversions) != len(args):
        raise _NotComputable
    converted: list[object] = []
    for conv, arg in zip(conversions, args, strict=True):
        if conv in "diouxXc" and _INTEGER.fullmatch(arg):
            converted.append(int(arg))
        elif conv in "eEfFgG":
            converted.append(float(arg))
        else:
            converted.append(arg)
    return fmt % tuple(converted)


def _str_format(fmt: str, args: Sequence[str]) -> str:
    """fmt.format(*args) for plain {} and {N} fields only."""
    out: list[str] = []
    pos = auto = 0
    manual = False
    for m in _FORMAT_TOKEN.finditer(fmt):
        out.append(fmt[pos : m.start()])
        token = m.group(0)
        if token in ("{{", "}}"):
            out.append(token[0])
        elif token in ("{", "}"):
            raise _NotComputable
        elif m.group(1):
            manual = True
            out.append(args[int(m.group(1))])
        else:
            out.append(args[auto])
            auto += 1
        pos = m.end()
    if manual and auto:
        raise _NotComputable
    out.append(fmt[pos:])
    return "".join(out)


class FlowKind(StrEnum):
    # A process call; nothing suspicious is shown to reach it.
    PROCESS = "process"
    # A download tool or URL is the command, or a URL is an argument.
    DOWNLOAD = "download"
    # File contents or decoded data are the command.
    OPAQUE_DATA = "opaque_data"
    # The command is built from constants in a way the analysis cannot compute.
    HIDDEN_COMMAND = "hidden_command"
    # Code the analysis cannot follow (__import__(x), exec(x), chr(), decoding).
    DYNAMIC = "dynamic"


@dataclass(frozen=True)
class FlowHit:
    line: int
    kind: FlowKind


@dataclass(frozen=True)
class FlowResult:
    hits: tuple[FlowHit, ...] = ()
    # The file can start processes (imports and dynamic imports included).
    can_run_processes: bool = False
    # The analysis gave up (too large, too deep or did not settle); nothing is proven.
    incomplete: bool = False


_INCOMPLETE = FlowResult(incomplete=True)


def analyze(source: str, *, depth: int = 0) -> FlowResult | None:
    """Analyse Python source. None when it is not valid Python 3: the caller then
    falls back to regexes. Only parses; nothing in the source is run."""
    if len(source) > limits.MAX_AST_SOURCE_CHARS:
        return _INCOMPLETE
    try:
        with warnings.catch_warnings():
            # Untrusted code may trigger SyntaxWarnings; they would only add noise.
            warnings.simplefilter("ignore")
            tree = ast.parse(source)
    except (SyntaxError, ValueError):
        return None
    except (RecursionError, MemoryError):
        return _INCOMPLETE
    try:
        return _Analyzer(tree, depth).run()
    except (RecursionError, MemoryError):
        return _INCOMPLETE


@dataclass(frozen=True)
class _Func:
    params: tuple[str, ...]
    keyword_only: tuple[str, ...]
    vararg: str | None
    kwarg: str | None
    is_method: bool

    @classmethod
    def of(cls, args: ast.arguments, *, is_method: bool) -> "_Func":
        return cls(
            params=tuple(a.arg for a in (*args.posonlyargs, *args.args)),
            keyword_only=tuple(a.arg for a in args.kwonlyargs),
            vararg=args.vararg.arg if args.vararg else None,
            kwarg=args.kwarg.arg if args.kwarg else None,
            is_method=is_method,
        )


@dataclass(frozen=True)
class _AppendSite:
    """A cmd.append(x) / cmd.extend(xs) / cmd.insert(0, x) call, by source position."""

    key: str
    position: tuple[int, int]
    kind: str  # "append", "extend" or "prepend"


def _key(node: ast.expr) -> str | None:
    """Storage key for a name, an attribute chain (self.cmd) or a subscript (d["x"] -> d)."""
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        base = _key(node.value)
        return f"{base}.{node.attr}" if base else None
    if isinstance(node, (ast.Subscript, ast.Starred)):
        return _key(node.value)
    return None


def _call_args(call: ast.Call) -> list[ast.expr]:
    return [*call.args, *(kw.value for kw in call.keywords)]


def _program_names(v: Value) -> frozenset[str] | None:
    """Base names of a program value ("/usr/bin/sudo" -> "sudo"), when all are known."""
    known = v.known_strings
    if known is None:
        return None
    names = set()
    for s in known:
        name = s.replace("\\", "/").rsplit("/", 1)[-1].lower()
        names.add(name.removesuffix(".exe"))
    return frozenset(names)


def _is_shell_command_flag(v: Value) -> bool:
    known = v.known_strings or frozenset()
    return any(
        s.lower() in _SHELL_COMMAND_FLAGS or _POSIX_COMMAND_FLAG.fullmatch(s.lower()) for s in known
    )


def _argv_roles(argv: Value, *, shell: bool) -> tuple[list[Value], list[Value]]:
    """Split an argv value into (command position, argument position) values."""
    if not argv.seq:
        return [argv], []
    if shell:
        # shell=True with a list: the first element is the command text.
        first = argv.items[0] if argv.items else argv.head
        if first is None or first == _BOTTOM:
            return [argv], []
        return [first], list(argv.items[1:]) if argv.items is not None else [argv]
    if argv.items is None:
        # Structure unknown beyond the first element: only a plain program is trusted
        # to be the command; otherwise everything counts as command.
        names = _program_names(argv.head) if argv.head is not None else None
        if argv.head is None or names is None or names & (_LAUNCHERS | _SHELLS):
            return [argv], []
        return [argv.head], [argv]
    items = list(argv.items)
    i = 0
    while i < len(items):
        names = _program_names(items[i])
        if names is None or not names <= _LAUNCHERS:
            break
        i += 1
        while i < len(items) and _is_launcher_option(items[i]):
            takes_value = (items[i].known_strings or frozenset()) & _LAUNCHER_VALUE_OPTIONS
            i += 2 if takes_value else 1
    if i >= len(items):
        return [], items
    command, rest = items[i], items[i + 1 :]
    names = _program_names(command)
    if names is None or names & _SHELLS:
        for j, item in enumerate(rest):
            if item.known_strings is None:
                # A flag we cannot read: the rest may be command text.
                return [command, *rest[j:]], [*items[:i], *rest[:j]]
            if _is_shell_command_flag(item):
                return [command, *rest[j + 1 : j + 2]], [*items[:i], *rest[: j + 1], *rest[j + 2 :]]
    return [command], [*items[:i], *rest]


def _is_launcher_option(v: Value) -> bool:
    known = v.known_strings
    return known is not None and all(_LAUNCHER_OPTION.fullmatch(s) for s in known)


def _verdict(commands: Sequence[Value], arguments: Sequence[Value]) -> FlowKind:
    if any(v.has_tool() or v.has_url(in_shell=True) for v in commands):
        return FlowKind.DOWNLOAD
    if any(v.has_url() for v in arguments):
        return FlowKind.DOWNLOAD
    if any(v.opaque for v in commands):
        return FlowKind.OPAQUE_DATA
    if any(v.derived for v in commands):
        return FlowKind.HIDDEN_COMMAND
    return FlowKind.PROCESS


_SEVERITY = [FlowKind.PROCESS, FlowKind.HIDDEN_COMMAND, FlowKind.OPAQUE_DATA, FlowKind.DOWNLOAD]


def _is_process_qual(q: str) -> bool:
    if q in PROCESS_FUNCS:
        return True
    prefix = f"{_CTYPES_LIBRARY}."
    return q.startswith(prefix) and q.removeprefix(prefix) in _CTYPES_PROCESS


class _Analyzer:
    def __init__(self, tree: ast.Module, depth: int) -> None:
        self.depth = depth
        self.nodes = list(ast.walk(tree))
        self.values: dict[str, Value] = {}
        self.quals: dict[str, frozenset[str]] = {}
        self.changes: dict[str, int] = {}
        self.funcs: dict[str, list[_Func]] = {}
        self.returns: list[tuple[str, ast.expr]] = []
        self.appends: dict[str, list[_AppendSite]] = {}
        self.bound: set[str] = set()
        self.capable = False
        self.changed = False
        self._collect()

    # -- setup: imports, functions, bound names ---------------------------------

    def _collect(self) -> None:
        methods = {
            id(n)
            for c in self.nodes
            if isinstance(c, ast.ClassDef)
            for n in c.body
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
        }
        for node in self.nodes:
            if isinstance(node, ast.Import):
                for alias in node.names:
                    top = alias.name.split(".")[0]
                    if alias.asname:
                        self._merge_quals(alias.asname, frozenset({alias.name}))
                    else:
                        self._merge_quals(top, frozenset({top}))
                    if top in PROCESS_MODULES or alias.name in PROCESS_MODULES:
                        self.capable = True
            elif isinstance(node, ast.ImportFrom):
                module = "." * node.level + (node.module or "")
                for alias in node.names:
                    qual = f"{module}.{alias.name}"
                    if module in PROCESS_MODULES or qual in PROCESS_FUNCS:
                        self.capable = True
                    if alias.name != "*":
                        self._merge_quals(alias.asname or alias.name, frozenset({qual}))
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                self._add_func(node.name, node.args, id(node) in methods)
                self.returns += [
                    (node.name, r.value)
                    for r in ast.walk(node)
                    if isinstance(r, ast.Return) and r.value is not None
                ]
            elif isinstance(node, ast.Assign) and isinstance(node.value, ast.Lambda):
                for t in node.targets:
                    if isinstance(t, ast.Name):
                        self._add_func(t.id, node.value.args, False)
                        self.returns.append((t.id, node.value.body))
            elif isinstance(node, ast.Call):
                self._collect_append(node)
            elif isinstance(node, ast.Name) and not isinstance(node.ctx, ast.Load):
                self.bound.add(node.id)
            elif isinstance(node, ast.arg):
                self.bound.add(node.arg)

    def _collect_append(self, call: ast.Call) -> None:
        func = call.func
        if not isinstance(func, ast.Attribute) or func.attr not in _MUTATORS:
            return
        key = _key(func.value)
        if key is None:
            return
        if func.attr in ("insert", "appendleft"):
            first = call.args[0] if func.attr == "insert" and call.args else None
            at_start = func.attr == "appendleft" or (
                isinstance(first, ast.Constant) and first.value == 0
            )
            kind = "prepend" if at_start else "append"
        elif func.attr in ("extend", "update", "extendleft"):
            kind = "extend"
        else:
            kind = "append"
        site = _AppendSite(key, (call.lineno, call.col_offset), kind)
        self.appends.setdefault(key, []).append(site)

    def _add_func(self, name: str, args: ast.arguments, is_method: bool) -> None:
        self.funcs.setdefault(name, []).append(_Func.of(args, is_method=is_method))
        self.bound.add(name)
        self._merge_quals(name, frozenset({f"local:{name}"}))

    # -- fixpoint ----------------------------------------------------------------

    def run(self) -> FlowResult:
        for _ in range(limits.MAX_FLOW_ITERATIONS):
            self.changed = False
            for node in self.nodes:
                self._propagate(node)
            for name, expr in self.returns:
                self._merge_value(f"return:{name}", self._value(expr))
            if not self.changed:
                return self._report()
        return _INCOMPLETE

    def _merge_value(self, key: str, value: Value) -> None:
        old = self.values.get(key, _BOTTOM)
        new = join(old, value)
        if new == old:
            return
        self.changes[key] = self.changes.get(key, 0) + 1
        if self.changes[key] > limits.MAX_FLOW_CHANGES and not new.widened:
            new = _widen(new)
        if new != old:
            self.values[key] = new
            self.changed = True

    def _merge_quals(self, key: str, quals: frozenset[str]) -> None:
        old = self.quals.get(key, frozenset())
        quals = frozenset(q for q in quals if q.count(".") < 8)
        new = old | quals
        if new != old and len(new) <= limits.MAX_FLOW_QUALS:
            self.quals[key] = new
            self.changed = True

    def _store(self, target: ast.expr, value: Value, quals: frozenset[str] = frozenset()) -> None:
        if isinstance(target, (ast.Tuple, ast.List)):
            if value.items is not None and len(value.items) == len(target.elts):
                for t, v in zip(target.elts, value.items, strict=True):
                    self._store(t, v)
                return
            for t in target.elts:
                self._store(t, _element(value), quals)
            return
        key = _key(target)
        if key is None:
            return
        self._merge_value(key, value)
        if quals:
            self._merge_quals(key, quals)

    def _bind(self, target: ast.expr, source: ast.expr) -> None:
        if (
            isinstance(target, (ast.Tuple, ast.List))
            and isinstance(source, (ast.Tuple, ast.List))
            and len(target.elts) == len(source.elts)
            and not any(isinstance(e, ast.Starred) for e in (*target.elts, *source.elts))
        ):
            for t, s in zip(target.elts, source.elts, strict=True):
                self._bind(t, s)
            return
        self._store(target, self._value(source), self._quals(source))

    def _propagate(self, node: ast.AST) -> None:
        if isinstance(node, ast.Assign):
            for t in node.targets:
                self._bind(t, node.value)
        elif isinstance(node, (ast.AnnAssign, ast.NamedExpr)) and node.value is not None:
            self._bind(node.target, node.value)
        elif isinstance(node, ast.AugAssign):
            current = self._value(node.target)
            self._store(node.target, self._binop(current, node.op, self._value(node.value)))
        elif isinstance(node, (ast.For, ast.AsyncFor, ast.comprehension)):
            self._store(node.target, _element(self._value(node.iter)))
        elif isinstance(node, ast.withitem) and node.optional_vars is not None:
            self._bind(node.optional_vars, node.context_expr)
        elif isinstance(node, ast.Call):
            self._propagate_call(node)

    def _propagate_call(self, call: ast.Call) -> None:
        func = call.func
        if isinstance(func, ast.Attribute) and func.attr in _MUTATORS:
            key = _key(func.value)
            if key is not None:
                args = call.args[1:] if func.attr == "insert" else call.args
                site = f"append:{key}:{call.lineno}:{call.col_offset}"
                self._merge_value(site, join(*(self._value(a) for a in args)))
        for name, offset in self._local_targets(func):
            for f in self.funcs[name]:
                self._bind_params(f, call, offset if f.is_method else 0)

    def _local_targets(self, func: ast.expr) -> list[tuple[str, int]]:
        """Local functions a call may reach, with how many leading params (self) to skip."""
        if isinstance(func, ast.Attribute) and func.attr in self.funcs:
            return [(func.attr, 1)]
        return [
            (q.removeprefix("local:"), 0)
            for q in self._quals(func)
            if q.startswith("local:") and q.removeprefix("local:") in self.funcs
        ]

    def _bind_params(self, f: _Func, call: ast.Call, offset: int) -> None:
        for i, arg in enumerate(call.args):
            if isinstance(arg, ast.Starred):
                for p in (*f.params, f.vararg):
                    if p:
                        self._merge_value(p, _element(self._value(arg)))
                continue
            index = i + offset
            if index < len(f.params):
                self._bind_name(f.params[index], arg)
            elif f.vararg:
                self._merge_value(f.vararg, _no_structure(self._value(arg)))
                self._merge_quals(f.vararg, self._quals(arg))
        for kw in call.keywords:
            if kw.arg in (*f.params, *f.keyword_only):
                self._bind_name(kw.arg, kw.value)
            elif f.kwarg:
                self._merge_value(f.kwarg, _no_structure(self._value(kw.value)))

    def _bind_name(self, name: str, source: ast.expr) -> None:
        self._merge_value(name, self._value(source))
        self._merge_quals(name, self._quals(source))

    # -- evaluation ----------------------------------------------------------------

    def _lookup(self, key: str) -> Value:
        """A variable's value, including what was appended to it."""
        base = self.values.get(key)
        sites = sorted(self.appends.get(key, ()), key=lambda s: s.position)
        if not sites:
            return base if base is not None else UNKNOWN
        added = [
            (s, self.values.get(f"append:{key}:{s.position[0]}:{s.position[1]}", _BOTTOM))
            for s in sites
        ]
        flat = join(
            *(_element(v) for _, v in added),
            _no_structure(base) if base is not None else UNKNOWN,
        )
        # Appends are taken in source order: right for straight-line code, which is
        # how commands are usually built.
        items = None
        if (
            base is not None
            and base.items is not None
            and all(s.kind == "append" for s, _ in added)
        ):
            ordered = base.items + tuple(v for _, v in added)
            items = ordered if len(ordered) <= limits.MAX_FLOW_ITEMS else None
        head: Value | None = None
        if base is not None and base.seq:
            if _has_head(base):
                head = base.head
            elif base.items == ():
                first_site, first = added[0]
                head = first.head if first_site.kind == "extend" else first
        prepends = [v for s, v in added if s.kind == "prepend"]
        if prepends:
            items = None
            head = join(head, *prepends) if head is not None else None
        return replace(flat, seq=True, items=items, head=head)

    def _binop(self, left: Value, op: ast.operator, right: Value) -> Value:
        if isinstance(op, ast.Add):
            return concat(left, right)
        if isinstance(op, ast.Mod):
            return self._percent_value(left, right)
        if isinstance(op, ast.Mult):
            return _uncomputed(left, right)
        return UNKNOWN

    def _percent_value(self, left: Value, right: Value) -> Value:
        formats = left.known_strings
        if right.seq:
            parts = [i.known_strings for i in right.items] if right.items is not None else [None]
        else:
            parts = [right.known_strings]
        if formats is not None and all(p is not None for p in parts):
            try:
                combos = _alternatives([sorted(formats), *(sorted(p or ()) for p in parts)])
                return _strings(_percent_format(str(c[0]), [str(x) for x in c[1:]]) for c in combos)
            except (_NotComputable, TypeError, ValueError, OverflowError, IndexError):
                pass
        return _uncomputed(left, right)

    def _value(self, node: ast.expr) -> Value:
        if isinstance(node, ast.Constant):
            if isinstance(node.value, str):
                return const(node.value)
            if isinstance(node.value, bytes):
                return const(node.value.decode("latin-1"))
            if isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
                return const(str(node.value))
            return _BOTTOM
        if isinstance(node, ast.JoinedStr):
            result = const("")
            for part in node.values:
                inner = part.value if isinstance(part, ast.FormattedValue) else part
                result = concat(result, _element(self._value(inner)))
            return result
        if isinstance(node, (ast.Name, ast.Attribute)):
            key = _key(node)
            return self._lookup(key) if key else UNKNOWN
        if isinstance(node, ast.BinOp):
            return self._binop(self._value(node.left), node.op, self._value(node.right))
        if isinstance(node, (ast.List, ast.Tuple)):
            return self._literal_sequence(node.elts)
        if isinstance(node, ast.Set):
            return _no_structure(join(*(self._value(e) for e in node.elts)))
        if isinstance(node, ast.Dict):
            return _no_structure(join(*(self._value(v) for v in node.values)))
        if isinstance(node, ast.Subscript):
            return self._subscript_value(node)
        if isinstance(node, ast.IfExp):
            return join(self._value(node.body), self._value(node.orelse))
        if isinstance(node, ast.BoolOp):
            return join(*(self._value(v) for v in node.values))
        if isinstance(node, (ast.NamedExpr, ast.Starred, ast.Await)):
            return self._value(node.value)
        if isinstance(node, (ast.ListComp, ast.SetComp, ast.GeneratorExp)):
            return _no_structure(self._value(node.elt))
        if isinstance(node, ast.DictComp):
            return _no_structure(self._value(node.value))
        if isinstance(node, ast.Call):
            return self._call_value(node)
        return UNKNOWN

    def _literal_sequence(self, elts: list[ast.expr]) -> Value:
        if not any(isinstance(e, ast.Starred) for e in elts):
            return sequence([self._value(e) for e in elts])
        flat = _no_structure(join(*(_element(self._value(e)) for e in elts)))
        first = elts[0]
        head = None if isinstance(first, ast.Starred) else self._value(first)
        return replace(flat, head=head)

    @staticmethod
    def _int(node: ast.expr | None) -> int | None:
        if (
            isinstance(node, ast.UnaryOp)
            and isinstance(node.op, ast.USub)
            and isinstance(node.operand, ast.Constant)
        ):
            node = node.operand
            sign = -1
        else:
            sign = 1
        if isinstance(node, ast.Constant) and type(node.value) is int:
            return sign * node.value
        return None

    def _subscript_value(self, node: ast.Subscript) -> Value:
        container = self._value(node.value)
        s = node.slice
        if isinstance(s, ast.Slice):
            parts = [None if p is None else self._int(p) for p in (s.lower, s.upper, s.step)]
            known = all(
                p is None or v is not None
                for p, v in zip((s.lower, s.upper, s.step), parts, strict=True)
            )
            if known and parts[2] != 0:
                sl = slice(*parts)
                if container.items is not None:
                    return sequence(list(container.items[sl]))
                strings = container.known_strings
                if strings is not None:
                    return _strings(x[sl] for x in strings)
            return replace(container, exact=False, items=None, head=None)
        index = self._int(s)
        if index is not None:
            if container.items is not None:
                if -len(container.items) <= index < len(container.items):
                    return container.items[index]
            elif index == 0 and container.head is not None and container.head != _BOTTOM:
                return container.head
            strings = container.known_strings
            if strings is not None and all(-len(x) <= index < len(x) for x in strings):
                return _strings(x[index] for x in strings)
        return replace(_element(container), exact=False)

    def _call_value(self, call: ast.Call) -> Value:
        func = call.func
        quals = self._quals(func)
        args = call.args
        builtin = self._builtin_value(quals, call)
        if builtin is not None:
            return builtin
        if self._is_decoder(func, quals):
            return _OPAQUE
        locals_ = self._local_targets(func)
        if locals_:
            return join(*(self.values.get(f"return:{n}", UNKNOWN) for n, _ in locals_))
        if quals & _PASSTHROUGH_FUNCS:
            return replace(_element(join(*map(self._value, _call_args(call)))), exact=False)
        if "shlex.split" in quals and args:
            return self._shlex_split(self._value(args[0]))
        if "os.getenv" in quals:
            return replace(join(UNKNOWN, *map(self._value, args[1:])), exact=False)
        if not isinstance(func, ast.Attribute):
            return UNKNOWN
        attr = func.attr
        if attr in _READ_METHODS:
            return _OPAQUE
        if attr == "get":
            # os.environ.get("X", "curl-config"): only the default is known.
            return replace(join(UNKNOWN, *map(self._value, args[1:])), exact=False)
        if attr in _CONTAINER_METHODS:
            return replace(_no_structure(self._value(func.value)), exact=False)
        if attr in _MUTATORS:
            return _BOTTOM
        receiver = self._value(func.value)
        if attr == "join":
            return self._join_value(receiver, call)
        if attr == "decode" and self._codec_decode(call):
            return _OPAQUE
        if attr == "format":
            return self._format_value(receiver, call)
        return self._method_value(attr, receiver, call)

    def _builtin_value(self, quals: frozenset[str], call: ast.Call) -> Value | None:
        """Builtins that build strings or lists, computed when their inputs are known."""
        args = call.args
        first = self._value(args[0]) if args else _BOTTOM
        if "builtins.str" in quals:
            return const("") if not args else _element(first) if first.seq else first
        if quals & {"builtins.list", "builtins.tuple"}:
            if not args:
                return sequence([])
            return first if first.seq else self._chars(first)
        if quals & {"builtins.set", "builtins.frozenset"}:
            return _no_structure(first)
        if "builtins.reversed" in quals and len(args) == 1:
            items = first.items if first.seq else self._chars(first).items
            return sequence(items[::-1]) if items is not None else _no_structure(first)
        if "builtins.sorted" in quals and len(args) == 1:
            if call.keywords:
                return _uncomputed(first, seq=True)
            items = first.items if first.seq else self._chars(first).items
            keys = [i.known_strings for i in items] if items is not None else None
            if keys is not None and all(k is not None and len(k) == 1 for k in keys):
                ordered = sorted(next(iter(k)) for k in keys if k)
                return sequence([const(x) for x in ordered])
            return _uncomputed(first, seq=True)
        if quals & {"builtins.bytes", "builtins.bytearray"}:
            return self._bytes_value(call, first)
        if "builtins.chr" in quals:
            return self._chr_value(args[0] if args else None)
        if "builtins.map" in quals and len(args) == 2:
            if "builtins.chr" in self._quals(args[0]):
                items = self._value(args[1]).items
                if items is not None:
                    chars = [self._chr_of(i) for i in items]
                    if all(c is not None for c in chars):
                        return sequence([c for c in chars if c is not None])
            return _uncomputed(*map(self._value, args), seq=True)
        return None

    def _chars(self, v: Value) -> Value:
        """A known string as a list of its characters."""
        strings = v.known_strings
        if strings is not None and len(strings) == 1:
            (s,) = strings
            if len(s) <= limits.MAX_FLOW_ITEMS:
                return sequence([const(c) for c in s])
        return _no_structure(v)

    def _bytes_value(self, call: ast.Call, first: Value) -> Value:
        if not call.args:
            return const("")
        arg = call.args[0]
        if isinstance(arg, (ast.List, ast.Tuple)):
            codes = [self._int(e) for e in arg.elts]
            if len(codes) <= limits.MAX_FLOW_STRING_CHARS and all(
                c is not None and 0 <= c < 256 for c in codes
            ):
                return const(bytes(c for c in codes if c is not None).decode("latin-1"))
        if not first.seq and first.known_strings is not None:
            return first  # bytes("text", "utf-8")
        return _uncomputed(first, *map(self._value, call.args[1:]))

    def _chr_of(self, v: Value) -> Value | None:
        strings = v.known_strings
        if strings is None or not all(_INTEGER.fullmatch(s) for s in strings):
            return None
        try:
            return _strings(chr(int(s)) for s in strings)
        except (ValueError, OverflowError):
            return None

    def _chr_value(self, arg: ast.expr | None) -> Value:
        computed = self._chr_of(self._value(arg)) if arg is not None else None
        return computed if computed is not None else _OPAQUE

    def _shlex_split(self, text: Value) -> Value:
        strings = text.known_strings
        if strings is not None and len(strings) == 1:
            try:
                parts = shlex.split(next(iter(strings)))
            except ValueError:
                parts = None
            if parts is not None and len(parts) <= limits.MAX_FLOW_ITEMS:
                return sequence([const(p) for p in parts])
        # Unknown split: treat the text as one command, the safe side.
        return sequence([_element(text)])

    def _py_args(self, nodes: Sequence[ast.expr]) -> list[Sequence[object]] | None:
        out: list[Sequence[object]] = []
        for node in nodes:
            if isinstance(node, ast.Constant) and (
                node.value is None or type(node.value) in (int, str)
            ):
                out.append([node.value])
                continue
            number = self._int(node)
            if number is not None:
                out.append([number])
                continue
            strings = self._value(node).known_strings
            if strings is None:
                return None
            out.append(sorted(strings))
        return out

    def _method_value(self, name: str, receiver: Value, call: ast.Call) -> Value:
        arg_values = [self._value(a) for a in _call_args(call)]
        strings = receiver.known_strings
        if name in _STR_METHODS and strings is not None and not call.keywords:
            alternatives = self._py_args(call.args)
            if alternatives is not None:
                try:
                    combos = _alternatives([sorted(strings), *alternatives])
                    return _from_results(_str_method(name, str(c[0]), tuple(c[1:])) for c in combos)
                except (_NotComputable, TypeError, ValueError, OverflowError):
                    pass
        return _uncomputed(receiver, *arg_values)

    def _join_value(self, receiver: Value, call: ast.Call) -> Value:
        arg_values = [self._value(a) for a in _call_args(call)]
        separators = receiver.known_strings
        if separators is None or len(call.args) != 1 or call.keywords:
            return _uncomputed(receiver, *arg_values)
        arg = arg_values[0]
        items = arg.items if arg.seq else self._chars(arg).items
        if items is not None:
            parts = [i.known_strings for i in items]
            if all(p is not None for p in parts):
                try:
                    combos = _alternatives([sorted(separators), *(sorted(p or ()) for p in parts)])
                    return _strings(str(c[0]).join(str(x) for x in c[1:]) for c in combos)
                except _NotComputable:
                    pass
        return _uncomputed(receiver, arg)

    def _format_value(self, receiver: Value, call: ast.Call) -> Value:
        arg_values = [self._value(a) for a in _call_args(call)]
        formats = receiver.known_strings
        parts = [v.known_strings for v in arg_values]
        if formats is not None and not call.keywords and all(p is not None for p in parts):
            try:
                combos = _alternatives([sorted(formats), *(sorted(p or ()) for p in parts)])
                return _strings(_str_format(str(c[0]), [str(x) for x in c[1:]]) for c in combos)
            except (_NotComputable, IndexError, ValueError):
                pass
        return _uncomputed(receiver, *arg_values)

    def _codec_decode(self, call: ast.Call) -> bool:
        codecs = [self._value(a).known_strings for a in call.args[:1]]
        return any(c and any(x.lower() in _CODEC_DECODERS for x in c) for c in codecs)

    @staticmethod
    def _is_decoder(func: ast.expr, quals: frozenset[str]) -> bool:
        if quals & {"builtins.chr", "codecs.decode", "codecs.encode"}:
            return True
        if isinstance(func, ast.Attribute) and func.attr in _DECODERS:
            return True
        return any(q.rsplit(".", 1)[-1] in _DECODERS for q in quals)

    def _quals(self, node: ast.expr) -> frozenset[str]:
        """Dotted names an expression may refer to, e.g. "subprocess.run"."""
        if isinstance(node, ast.Name):
            known = self.quals.get(node.id)
            if known:
                return known
            if node.id in _BUILTIN_NAMES and node.id not in self.bound:
                return frozenset({f"builtins.{node.id}"})
            return frozenset()
        if isinstance(node, ast.Attribute):
            base = self._quals(node.value)
            quals = {f"{q}.{node.attr}" for q in base if q.count(".") < 8}
            if base & _CTYPES_LIBRARY_LOADERS and node.attr != "LoadLibrary":
                quals.add(_CTYPES_LIBRARY)  # ctypes.cdll.msvcrt
            return frozenset(quals)
        if isinstance(node, ast.Call):
            return self._call_quals(node)
        if isinstance(node, ast.Subscript) and "sys.modules" in self._quals(node.value):
            return self._value(node.slice).known_strings or frozenset()
        if isinstance(node, (ast.NamedExpr, ast.Starred)):
            return self._quals(node.value)
        if isinstance(node, ast.IfExp):
            return self._quals(node.body) | self._quals(node.orelse)
        if isinstance(node, ast.BoolOp):
            return frozenset().union(*(self._quals(v) for v in node.values))
        return frozenset()

    def _call_quals(self, call: ast.Call) -> frozenset[str]:
        quals = self._quals(call.func)
        if quals & _IMPORT_FUNCS and call.args:
            names = self._value(call.args[0]).known_strings or frozenset()
            return names | frozenset(n.split(".")[0] for n in names)
        if "builtins.getattr" in quals and len(call.args) >= 2:
            names = self._value(call.args[1]).known_strings or frozenset()
            return frozenset(f"{b}.{n}" for b in self._quals(call.args[0]) for n in names)
        if "functools.partial" in quals and call.args:
            return self._quals(call.args[0])
        if quals & _CTYPES_LOADERS:
            return frozenset({_CTYPES_LIBRARY})
        return frozenset()

    # -- report ----------------------------------------------------------------

    def _report(self) -> FlowResult:
        hits: list[FlowHit] = []
        incomplete = False
        for node in self.nodes:
            if isinstance(node, (ast.Name, ast.Attribute)) and isinstance(node.ctx, ast.Load):
                quals = self._quals(node)
                if any(_is_process_qual(q) for q in quals) or quals & PROCESS_MODULES:
                    self.capable = True
                builtins_ref = isinstance(node, ast.Name) and node.id == "__builtins__"
                if builtins_ref or self._is_decoder(node, quals) or self._runs_file(node, quals):
                    hits.append(FlowHit(node.lineno, FlowKind.DYNAMIC))
            elif isinstance(node, ast.Subscript) and self._dynamic_lookup(node):
                hits.append(FlowHit(node.lineno, FlowKind.DYNAMIC))
            elif isinstance(node, ast.Call):
                hits += self._process_call_hits(node)
                nested, nested_incomplete = self._dynamic_call_hits(node)
                hits += nested
                incomplete = incomplete or nested_incomplete
        if incomplete:
            return FlowResult(can_run_processes=self.capable, incomplete=True)
        return FlowResult(hits=tuple(hits), can_run_processes=self.capable)

    @staticmethod
    def _runs_file(node: ast.expr, quals: frozenset[str]) -> bool:
        if "builtins.execfile" in quals:
            return True
        return isinstance(node, ast.Attribute) and node.attr in _RUN_FILE_ATTRS

    def _dynamic_lookup(self, node: ast.Subscript) -> bool:
        """globals()[x], sys.modules[x], module.__dict__[x] with a key we cannot know."""
        container = node.value
        dynamic_container = (
            (isinstance(container, ast.Call) and self._quals(container.func) & _SCOPE_FUNCS)
            or "sys.modules" in self._quals(container)
            or (isinstance(container, ast.Attribute) and container.attr == "__dict__")
        )
        return bool(dynamic_container) and self._value(node.slice).known_strings is None

    def _process_call_hits(self, call: ast.Call) -> list[FlowHit]:
        func = call.func
        quals = [q for q in self._quals(func) if _is_process_qual(q)]
        if isinstance(func, ast.Attribute) and func.attr == "spawn":
            # distutils/setuptools build commands: self.spawn([...]).
            quals.append("distutils.spawn.spawn")
        if quals:
            self.capable = True
            kinds = [_verdict(*self._call_roles(call, q)) for q in quals]
            return [FlowHit(call.lineno, max(kinds, key=_SEVERITY.index))]
        # A process function handed to something else: partial(run, [...]),
        # Thread(target=os.system, args=(...)), map(os.system, cmds). The roles
        # of the other arguments are unknown, so all of them count as command.
        args = _call_args(call)
        callbacks = [a for a in args if any(_is_process_qual(q) for q in self._quals(a))]
        if callbacks:
            self.capable = True
            rest = [self._value(a) for a in args if a not in callbacks]
            return [FlowHit(call.lineno, _verdict(rest, []))]
        return []

    def _call_roles(self, call: ast.Call, qual: str) -> tuple[list[Value], list[Value]]:
        """(command position, argument position) values of a process call."""
        if any(isinstance(a, ast.Starred) for a in call.args):
            return [self._value(a) for a in _call_args(call)], []
        pos = [self._value(a) for a in call.args]
        keywords = {kw.arg: kw.value for kw in call.keywords if kw.arg}
        if qual in _SHELL_TEXT_FUNCS:
            text = pos[:1] or [self._value(v) for v in keywords.values()]
            return text, pos[1:]
        if qual in _ARGV_AS_ARGS_FUNCS:
            return _argv_roles(sequence(pos), shell=False)
        if qual in _ARGV_FUNCS:
            argv_node = call.args[0] if call.args else keywords.get("args")
            argv = self._value(argv_node) if argv_node is not None else UNKNOWN
            commands, arguments = _argv_roles(argv, shell=self._shell(keywords.get("shell")))
            if "executable" in keywords:
                commands.append(self._value(keywords["executable"]))
            return commands, [*arguments, *pos[1:]]
        if qual in _EXECL:
            commands, arguments = _argv_roles(sequence(pos[1:]), shell=False)
            return [*pos[:1], *commands], arguments
        if qual in _EXECV:
            commands, arguments = _argv_roles(pos[1] if len(pos) > 1 else UNKNOWN, shell=False)
            return [*pos[:1], *commands], [*arguments, *pos[2:]]
        if qual in _SPAWNL:
            commands, arguments = _argv_roles(sequence(pos[2:]), shell=False)
            return [*pos[1:2], *commands], arguments
        if qual in _SPAWNV:
            commands, arguments = _argv_roles(pos[2] if len(pos) > 2 else UNKNOWN, shell=False)
            return [*pos[1:2], *commands], [*arguments, *pos[3:]]
        # ctypes: C functions take the command in different places; all count.
        return [self._value(a) for a in _call_args(call)], []

    def _shell(self, node: ast.expr | None) -> bool:
        if node is None:
            return False
        if isinstance(node, ast.Constant):
            return bool(node.value)
        return True  # shell=<variable>: assume the shell, the safe side

    def _dynamic_call_hits(self, call: ast.Call) -> tuple[list[FlowHit], bool]:
        quals = self._quals(call.func)
        line = call.lineno
        if quals & _IMPORT_FUNCS:
            if call.args and self._value(call.args[0]).known_strings:
                return [], False
            # An import we cannot compute may be subprocess: in setup.py that alone
            # counts as being able to run processes.
            self.capable = True
            return [FlowHit(line, FlowKind.DYNAMIC)], False
        if "builtins.getattr" in quals and len(call.args) >= 2:
            if self._value(call.args[1]).known_strings is None and self._quals(call.args[0]):
                self.capable = True
                return [FlowHit(line, FlowKind.DYNAMIC)], False
            return [], False
        if quals & _EXEC_FUNCS:
            return self._exec_hits(call)
        if isinstance(call.func, ast.Attribute) and call.func.attr == "decode":
            return ([FlowHit(line, FlowKind.DYNAMIC)] if self._codec_decode(call) else []), False
        return [], False

    def _exec_hits(self, call: ast.Call) -> tuple[list[FlowHit], bool]:
        """exec("...") of known strings is analysed as code; anything else is dynamic."""
        line = call.lineno
        sources = call.args and self._value(call.args[0]).known_strings
        if not sources or self.depth >= limits.MAX_NESTED_EXEC_DEPTH:
            # Too deep to analyse: the strings may still show they start processes.
            if any(p.search(s) for p in PROCESS_CAPABILITY for s in sources or ()):
                self.capable = True
            return [FlowHit(line, FlowKind.DYNAMIC)], False
        hits: list[FlowHit] = []
        for source in sorted(sources):
            nested = analyze(source, depth=self.depth + 1)
            if nested is None:
                hits.append(FlowHit(line, FlowKind.DYNAMIC))
                continue
            if nested.incomplete:
                return [], True
            self.capable = self.capable or nested.can_run_processes
            hits += [FlowHit(line, h.kind) for h in nested.hits]
        return hits, False
