"""Static data flow for Python install scripts (setup.py), built on ast.parse.

The source is only parsed, never compiled or run. The analysis is coarse on
purpose: one file, flow-insensitive, names merged across scopes. It errs on the
suspicious side: code it cannot follow (__import__(x), exec(x), chr(), decoding)
is reported as dynamic, never assumed clean.
"""

import ast
import re
import warnings
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

_OS_PROCESS = [
    "system",
    "popen",
    "popen2",
    "popen3",
    "popen4",
    "startfile",
    "posix_spawn",
    "posix_spawnp",
    "execl",
    "execle",
    "execlp",
    "execlpe",
    "execv",
    "execve",
    "execvp",
    "execvpe",
    "spawnl",
    "spawnle",
    "spawnlp",
    "spawnlpe",
    "spawnv",
    "spawnve",
    "spawnvp",
    "spawnvpe",
]
PROCESS_FUNCS = frozenset(
    {
        *(
            f"subprocess.{n}"
            for n in ["run", "call", "check_call", "check_output", "Popen", "getoutput"]
        ),
        "subprocess.getstatusoutput",
        *(f"os.{n}" for n in _OS_PROCESS),
        "pty.spawn",
        "asyncio.create_subprocess_exec",
        "asyncio.create_subprocess_shell",
        "commands.getoutput",
        "commands.getstatusoutput",
        "platform.popen",
        "distutils.spawn.spawn",
    }
)
PROCESS_MODULES = frozenset({"subprocess", "pty", "commands", "asyncio.subprocess"})

_IMPORT_FUNCS = frozenset(
    {"builtins.__import__", "importlib.import_module", "importlib.__import__"}
)
_EXEC_FUNCS = frozenset({"builtins.exec", "builtins.eval", "builtins.compile"})
_SCOPE_FUNCS = frozenset({"builtins.globals", "builtins.locals", "builtins.vars"})
# Referencing any of these (called or passed, e.g. map(chr, ...)) builds strings
# the analysis cannot see.
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
_PASSTHROUGH_METHODS = frozenset(
    {
        "strip", "lstrip", "rstrip", "lower", "upper", "casefold", "title", "capitalize",
        "replace", "split", "rsplit", "splitlines", "encode", "expandtabs", "center", "ljust",
        "rjust", "zfill", "removeprefix", "removesuffix", "partition", "rpartition", "items",
        "values", "keys", "copy", "pop", "format", "format_map",
    }
)  # fmt: skip
_PASSTHROUGH_FUNCS = frozenset(
    {
        "builtins.str", "builtins.list", "builtins.tuple", "builtins.set", "builtins.sorted",
        "builtins.reversed", "shlex.split", "shlex.join", "shlex.quote", "os.path.join",
        "os.path.abspath", "os.path.expanduser", "os.path.normpath", "os.fspath",
        "pathlib.Path", "pathlib.PurePath",
    }
)  # fmt: skip
_MUTATORS = frozenset({"append", "add", "insert", "extend", "update", "appendleft", "extendleft"})
_BUILTIN_NAMES = frozenset(
    {
        "__import__", "getattr", "exec", "eval", "compile", "execfile", "chr", "globals",
        "locals", "vars", "str", "list", "tuple", "set", "sorted", "reversed",
    }
)  # fmt: skip


def _is_download(s: str) -> bool:
    return bool(DOWNLOAD_TOOL.search(s) or URL.search(s))


@dataclass(frozen=True)
class Value:
    """What a string-ish expression may hold."""

    strings: frozenset[str] = frozenset()
    # `strings` holds every possible value (needed to analyse exec("...")).
    exact: bool = False
    # Too many or too long strings were dropped; `dropped_tainted` keeps their verdict.
    widened: bool = False
    dropped_tainted: bool = False
    # Built from data the analysis cannot see: file contents, decoding, chr().
    opaque: bool = False
    # A list, tuple or dict: + joins elements instead of concatenating strings.
    seq: bool = False

    @property
    def tainted(self) -> bool:
        return self.dropped_tainted or any(_is_download(s) for s in self.strings)

    @property
    def known_strings(self) -> frozenset[str] | None:
        """Every possible value, or None when they are not all known."""
        if self.exact and self.strings and not self.widened:
            return self.strings
        return None


UNKNOWN = Value()
_BOTTOM = Value(exact=True)
_OPAQUE = Value(opaque=True)


def _widen(v: Value) -> Value:
    return Value(widened=True, dropped_tainted=v.tainted, opaque=v.opaque, seq=v.seq)


def _bounded(v: Value) -> Value:
    if not v.widened and (
        len(v.strings) > limits.MAX_FLOW_VALUES
        or any(len(s) > limits.MAX_FLOW_STRING_CHARS for s in v.strings)
    ):
        return _widen(v)
    return v


def _const(s: str) -> Value:
    return _bounded(Value(frozenset({s}), exact=True))


def join(*values: Value) -> Value:
    if not values:
        return _BOTTOM
    if any(v.widened for v in values):
        return Value(
            widened=True,
            dropped_tainted=any(v.tainted for v in values),
            opaque=any(v.opaque for v in values),
            seq=any(v.seq for v in values),
        )
    return _bounded(
        Value(
            strings=frozenset().union(*(v.strings for v in values)),
            exact=all(v.exact for v in values),
            opaque=any(v.opaque for v in values),
            seq=any(v.seq for v in values),
        )
    )


def _inexact(v: Value) -> Value:
    return replace(v, exact=False)


def concat(left: Value, right: Value) -> Value:
    if left.seq or right.seq:
        return join(left, right)
    ls = left.strings or frozenset({_UNKNOWN_PART})
    rs = right.strings or frozenset({_UNKNOWN_PART})
    if left.widened or right.widened or len(ls) * len(rs) > limits.MAX_FLOW_VALUES:
        return Value(
            widened=True,
            dropped_tainted=left.tainted or right.tainted,
            opaque=left.opaque or right.opaque,
        )
    return _bounded(
        Value(
            strings=frozenset(a + b for a in ls for b in rs),
            exact=left.exact and right.exact and bool(left.strings) and bool(right.strings),
            opaque=left.opaque or right.opaque,
        )
    )


class FlowKind(StrEnum):
    # A process call; nothing suspicious is shown to reach it.
    PROCESS = "process"
    # A download tool or URL reaches a process call.
    DOWNLOAD = "download"
    # File contents or generated strings reach a process call.
    OPAQUE_DATA = "opaque_data"
    # Code the analysis cannot follow (__import__(x), exec(x), chr(), decoding).
    DYNAMIC = "dynamic"


@dataclass(frozen=True)
class FlowHit:
    line: int
    kind: FlowKind


@dataclass(frozen=True)
class FlowResult:
    hits: tuple[FlowHit, ...] = ()
    # The file can start processes (imports included).
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


class _Analyzer:
    def __init__(self, tree: ast.Module, depth: int) -> None:
        self.depth = depth
        self.nodes = list(ast.walk(tree))
        self.values: dict[str, Value] = {}
        self.quals: dict[str, frozenset[str]] = {}
        self.changes: dict[str, int] = {}
        self.funcs: dict[str, list[_Func]] = {}
        self.returns: list[tuple[str, ast.expr]] = []
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
            elif isinstance(node, ast.Name) and not isinstance(node.ctx, ast.Load):
                self.bound.add(node.id)
            elif isinstance(node, ast.arg):
                self.bound.add(node.arg)

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
            for t in target.elts:
                self._store(t, value, quals)
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
        value = self._value(source)
        if isinstance(target, (ast.Tuple, ast.List)):
            value = replace(value, seq=False)
        self._store(target, value, self._quals(source))

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
            self._store(node.target, replace(self._value(node.iter), seq=False))
        elif isinstance(node, ast.withitem) and node.optional_vars is not None:
            self._bind(node.optional_vars, node.context_expr)
        elif isinstance(node, ast.Call):
            self._propagate_call(node)

    def _propagate_call(self, call: ast.Call) -> None:
        func = call.func
        if isinstance(func, ast.Attribute) and func.attr in _MUTATORS:
            key = _key(func.value)
            if key is not None:
                args = [self._value(a) for a in _call_args(call)]
                self._merge_value(key, replace(join(*args), seq=True))
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
                        self._merge_value(p, self._value(arg))
                continue
            index = i + offset
            if index < len(f.params):
                self._bind_name(f.params[index], arg)
            elif f.vararg:
                self._merge_value(f.vararg, replace(self._value(arg), seq=True))
                self._merge_quals(f.vararg, self._quals(arg))
        for kw in call.keywords:
            if kw.arg in (*f.params, *f.keyword_only):
                self._bind_name(kw.arg, kw.value)
            elif f.kwarg:
                self._merge_value(f.kwarg, replace(self._value(kw.value), seq=True))

    def _bind_name(self, name: str, source: ast.expr) -> None:
        self._merge_value(name, self._value(source))
        self._merge_quals(name, self._quals(source))

    # -- evaluation ----------------------------------------------------------------

    def _binop(self, left: Value, op: ast.operator, right: Value) -> Value:
        if isinstance(op, ast.Add):
            return concat(left, right)
        if isinstance(op, (ast.Mod, ast.Mult)):
            # "%s -O" % tool, "x" * 2: keep both sides so a tool name is still seen.
            return _inexact(join(left, right))
        return UNKNOWN

    def _value(self, node: ast.expr) -> Value:
        if isinstance(node, ast.Constant):
            if isinstance(node.value, str):
                return _const(node.value)
            if isinstance(node.value, bytes):
                return _const(node.value.decode("latin-1"))
            if isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
                return _const(str(node.value))
            return _BOTTOM
        if isinstance(node, ast.JoinedStr):
            result = _const("")
            for part in node.values:
                part_value = (
                    self._value(part.value)
                    if isinstance(part, ast.FormattedValue)
                    else self._value(part)
                )
                result = concat(result, replace(part_value, seq=False))
            return result
        if isinstance(node, (ast.Name, ast.Attribute)):
            key = _key(node)
            return self.values.get(key, UNKNOWN) if key else UNKNOWN
        if isinstance(node, ast.BinOp):
            return self._binop(self._value(node.left), node.op, self._value(node.right))
        if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
            return replace(join(*(self._value(e) for e in node.elts)), seq=True)
        if isinstance(node, ast.Dict):
            return replace(join(*(self._value(v) for v in node.values)), seq=True)
        if isinstance(node, ast.Subscript):
            return self._subscript_value(node)
        if isinstance(node, ast.IfExp):
            return join(self._value(node.body), self._value(node.orelse))
        if isinstance(node, ast.BoolOp):
            return join(*(self._value(v) for v in node.values))
        if isinstance(node, (ast.NamedExpr, ast.Starred, ast.Await)):
            return self._value(node.value)
        if isinstance(node, (ast.ListComp, ast.SetComp, ast.GeneratorExp)):
            return replace(self._value(node.elt), seq=True)
        if isinstance(node, ast.DictComp):
            return replace(self._value(node.value), seq=True)
        if isinstance(node, ast.Call):
            return self._call_value(node)
        return UNKNOWN

    def _subscript_value(self, node: ast.Subscript) -> Value:
        container = self._value(node.value)
        s = node.slice
        if (
            isinstance(s, ast.Slice)
            and s.lower is None
            and s.upper is None
            and isinstance(s.step, ast.UnaryOp)
            and isinstance(s.step.op, ast.USub)
            and isinstance(s.step.operand, ast.Constant)
            and s.step.operand.value == 1
        ):
            # "lruc"[::-1]
            return replace(container, strings=frozenset(x[::-1] for x in container.strings))
        return replace(container, seq=container.seq and isinstance(s, ast.Slice), exact=False)

    def _call_value(self, call: ast.Call) -> Value:
        func = call.func
        quals = self._quals(func)
        if self._is_decoder(func, quals):
            return _OPAQUE
        locals_ = self._local_targets(func)
        if locals_:
            return join(*(self.values.get(f"return:{n}", UNKNOWN) for n, _ in locals_))
        args = _call_args(call)
        if quals & _PASSTHROUGH_FUNCS:
            return _inexact(join(*(self._value(a) for a in args)))
        if "os.getenv" in quals:
            return _inexact(join(UNKNOWN, *(self._value(a) for a in args[1:])))
        if not isinstance(func, ast.Attribute):
            return UNKNOWN
        attr = func.attr
        if attr in _READ_METHODS:
            return _OPAQUE
        if attr == "get":
            # os.environ.get("X", "curl-config"): only the default is known.
            return _inexact(join(UNKNOWN, *(self._value(a) for a in args[1:])))
        if attr == "join":
            return self._join_value(func.value, call)
        if attr == "decode":
            if self._codec_decode(call):
                return _OPAQUE
            return _inexact(self._value(func.value))
        if attr in _PASSTHROUGH_METHODS:
            receiver = self._value(func.value)
            return _inexact(join(receiver, *(self._value(a) for a in args)))
        return UNKNOWN

    def _join_value(self, separator: ast.expr, call: ast.Call) -> Value:
        sep = self._value(separator).known_strings
        if sep is not None and len(sep) == 1 and len(call.args) == 1:
            arg = call.args[0]
            if isinstance(arg, (ast.List, ast.Tuple)):
                parts = [self._value(e).known_strings for e in arg.elts]
                if all(p is not None and len(p) == 1 for p in parts):
                    (s,) = sep
                    return _const(s.join(next(iter(p)) for p in parts if p))
        return _inexact(replace(join(*(self._value(a) for a in call.args)), seq=False))

    def _codec_decode(self, call: ast.Call) -> bool:
        codecs = [self._value(a).known_strings for a in call.args[:1]]
        return any(c and any(x.lower() in _CODEC_DECODERS for x in c) for c in codecs)

    @staticmethod
    def _is_decoder(func: ast.expr, quals: frozenset[str]) -> bool:
        if "builtins.chr" in quals or "codecs.decode" in quals:
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
            return frozenset(
                f"{q}.{node.attr}" for q in self._quals(node.value) if q.count(".") < 8
            )
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
        return frozenset()

    # -- report ----------------------------------------------------------------

    def _report(self) -> FlowResult:
        hits: list[FlowHit] = []
        incomplete = False
        for node in self.nodes:
            if isinstance(node, (ast.Name, ast.Attribute)) and isinstance(node.ctx, ast.Load):
                quals = self._quals(node)
                if quals & PROCESS_FUNCS or quals & PROCESS_MODULES:
                    self.capable = True
                if (
                    self._is_decoder(node, quals)
                    or self._runs_file(node, quals)
                    or (isinstance(node, ast.Name) and node.id == "__builtins__")
                ):
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

    def _classify(self, value: Value) -> FlowKind:
        if value.tainted:
            return FlowKind.DOWNLOAD
        if value.opaque:
            return FlowKind.OPAQUE_DATA
        return FlowKind.PROCESS

    def _process_call_hits(self, call: ast.Call) -> list[FlowHit]:
        func = call.func
        args = _call_args(call)
        is_process = bool(self._quals(func) & PROCESS_FUNCS) or (
            # distutils/setuptools build commands: self.spawn([...]).
            isinstance(func, ast.Attribute) and func.attr == "spawn"
        )
        if is_process:
            self.capable = True
            return [FlowHit(call.lineno, self._classify(join(*map(self._value, args))))]
        # A process function handed to something else: partial(run, [...]),
        # Thread(target=os.system, args=(...)), map(os.system, cmds).
        callbacks = [a for a in args if self._quals(a) & PROCESS_FUNCS]
        if callbacks:
            self.capable = True
            rest = [self._value(a) for a in args if a not in callbacks]
            return [FlowHit(call.lineno, self._classify(join(*rest)))]
        return []

    def _dynamic_call_hits(self, call: ast.Call) -> tuple[list[FlowHit], bool]:
        quals = self._quals(call.func)
        line = call.lineno
        if quals & _IMPORT_FUNCS:
            known = call.args and self._value(call.args[0]).known_strings
            return ([] if known else [FlowHit(line, FlowKind.DYNAMIC)]), False
        if "builtins.getattr" in quals and len(call.args) >= 2:
            dynamic_name = self._value(call.args[1]).known_strings is None
            on_module = bool(self._quals(call.args[0]))
            return ([FlowHit(line, FlowKind.DYNAMIC)] if dynamic_name and on_module else []), False
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
