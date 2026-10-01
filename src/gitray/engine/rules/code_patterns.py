"""GR-CODE-*: dangerous code patterns. Down-weighted in documentation files."""

import re

from gitray.engine.rules.base import RegexRule, compile_all

# A pipe that is not part of "||".
_PIPE = r"(?<!\|)\|(?!\|)"
_SHELL = r"(?:sudo\s+(?:-\S+\s+)*)?(?:ba|z|da|k)?sh\b"
_INTERP = r"(?:sudo\s+)?(?:python[0-9.]*|perl|ruby|node)\b"

DECODE_EXEC = RegexRule(
    id="GR-CODE-001",
    title="Decodes hidden code and executes it",
    category="code",
    weight=45,
    doc_weight=5,
    why=(
        "Code is decoded (base64, hex, zlib, ...) and passed straight to an "
        "interpreter. Legitimate projects rarely hide what they run; malware "
        "does this to evade review and scanners."
    ),
    patterns=(
        *compile_all(
            # Python: exec/eval of decoded or decompressed data.
            r"\b(?:exec|eval)\s*\(.{0,60}?\b(?:b64decode|b32decode|b85decode|a85decode|"
            r"decompress|fromhex|unhexlify|decodebytes|marshal\.loads|codecs\.decode)\s*\(",
            # JavaScript: eval/Function of decoded data.
            r"\beval\s*\(\s*(?:atob|unescape|decodeURIComponent)\s*\(",
            r"\beval\s*\(\s*Buffer\.from\s*\(.{0,200}?['\"](?:base64|hex)['\"]",
            r"\bFunction\s*\(\s*(?:atob\s*\(|Buffer\.from\s*\()",
            # Shell: base64 -d piped into a shell.
            r"\bbase64\s+(?:-d|--decode|-D)\b[^|\n]{0,80}" + _PIPE + r"\s*" + _SHELL,
        ),
        *compile_all(
            # PowerShell: encoded command or IEX of a base64 payload.
            r"\b(?:powershell|pwsh)(?:\.exe)?\b.{0,80}?\s-e(?:nc(?:odedcommand)?)?\s+"
            r"[A-Za-z0-9+/=]{16,}",
            r"\b(?:iex|invoke-expression)\b.{0,120}?frombase64string",
            r"frombase64string.{0,200}?" + _PIPE + r"\s*(?:iex|invoke-expression)\b",
            flags=re.IGNORECASE,
        ),
    ),
)

PIPE_TO_SHELL = RegexRule(
    id="GR-CODE-002",
    title="Downloads a script and pipes it into a shell",
    category="code",
    weight=35,
    # "curl ... | sh" is a common, legitimate install line in READMEs.
    doc_weight=0,
    why=(
        "A remote script is downloaded and executed immediately, without being "
        "saved or reviewed. Whoever controls that URL controls your machine."
    ),
    patterns=(
        *compile_all(
            r"\b(?:curl|wget)\b[^|\n]{0,300}" + _PIPE + r"\s*(?:" + _SHELL + "|" + _INTERP + ")",
            r"\b(?:ba|z)?sh\s+-c\s+[\"']?\$\(\s*(?:curl|wget)\b",
            r"\b(?:ba|z)?sh\s+<\(\s*(?:curl|wget)\b",
        ),
        *compile_all(
            r"\b(?:iwr|irm|invoke-webrequest|invoke-restmethod|downloadstring)\b[^|\n]{0,300}"
            + _PIPE
            + r"\s*(?:iex|invoke-expression)\b",
            r"\b(?:iex|invoke-expression)\s*\(?\s*\(?\s*(?:new-object\s+net\.webclient\)\s*\."
            r"downloadstring|iwr|irm|invoke-webrequest|invoke-restmethod)\b",
            flags=re.IGNORECASE,
        ),
    ),
)

BROWSER_CREDENTIALS = RegexRule(
    id="GR-CODE-003",
    title="Accesses browser password or cookie stores",
    category="code",
    weight=40,
    doc_weight=5,
    why=(
        "References files where browsers keep saved passwords, cookies and the "
        "keys that decrypt them. Info-stealer malware targets exactly these files."
    ),
    patterns=(
        *compile_all(
            r"[\"'\\/]Login Data\b",
            r"\blogins\.json\b",
            r"\bkey[34]\.db\b",
            r"\bcookies\.sqlite\b",
            r"\bCryptUnprotectData\b",
        ),
        *compile_all(
            # "encrypted_key" alone is a standard JWE field; only Chrome's
            # os_crypt key (stored in "Local State") is a stealer indicator.
            r"Local State.{0,200}?os_crypt",
            r"os_crypt.{0,40}?encrypted_key",
            r"(?:Google[\\/]+Chrome|BraveSoftware[\\/]+Brave-Browser|Microsoft[\\/]+Edge|"
            r"Opera Software[\\/]+Opera Stable)[\\/]+(?:User Data|Default)",
            r"Mozilla[\\/]+Firefox[\\/]+Profiles",
            flags=re.IGNORECASE,
        ),
    ),
)

SSH_KEYS = RegexRule(
    id="GR-CODE-004",
    title="Accesses SSH private keys",
    category="code",
    weight=25,
    doc_weight=3,
    why=(
        "References SSH private keys or authorized_keys. Stealing private keys "
        "gives access to servers; writing authorized_keys plants a backdoor."
    ),
    patterns=compile_all(
        r"\.ssh[\\/]+(?:id_(?:rsa|dsa|ecdsa|ed25519)(?:_sk)?|authorized_keys)\b(?!\.pub)",
        r"[\"']\.ssh[\"']\s*[,)]",
    ),
)

CRYPTO_WALLETS = RegexRule(
    id="GR-CODE-005",
    title="Accesses cryptocurrency wallet files",
    category="code",
    weight=35,
    doc_weight=5,
    why=(
        "References wallet files, wallet application folders or wallet browser "
        "extensions. Crypto-stealing malware searches for exactly these."
    ),
    patterns=(
        *compile_all(
            r"\bwallet\.dat\b",
            r"\bexodus\.wallet\b",
            # Browser extension IDs: MetaMask, Phantom, Coinbase Wallet, Trust Wallet.
            r"\b(?:nkbihfbeogaeaoehlefnkodbefgpgknn|bfnaelmomeimhlpmgjnjophhpkkoljpa|"
            r"hnfanknocfeofbddgcijnmhnfnkdnaad|egjidjbpglichdcondbcbdnbeeppgdph)\b",
        ),
        *compile_all(
            r"[\\/]\.?(?:Electrum[\\/]+wallets|Ethereum[\\/]+keystore|atomic[\\/]+Local Storage|"
            r"Bitcoin[\\/]+wallets|Exodus[\\/]+exodus\.wallet)",
            flags=re.IGNORECASE,
        ),
    ),
)

RULES = (DECODE_EXEC, PIPE_TO_SHELL, BROWSER_CREDENTIALS, SSH_KEYS, CRYPTO_WALLETS)
