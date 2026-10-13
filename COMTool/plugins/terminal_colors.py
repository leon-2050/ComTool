# Modified for leon-2050/ComTool on 2026-10-13.
# Derived from https://github.com/Neutree/COMTool; original copyright retained.
# Source remains under LGPLv3; see LICENSE, COPYING.LESSER and COPYING.
"""Optional display-only highlighting for otherwise uncoloured terminal text."""
from functools import lru_cache
import re

_OCTET = r"(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)"
_RULES = (
    (re.compile(r"<access denied>|\b(?:permission denied|access denied|not found|error|failed|failure|fatal|denied|invalid)\b", re.I), "#ff6b6b"),
    (re.compile(r"\b(?:warning|warn|deprecated|unsupported|timeout)\b", re.I), "#f6d06f"),
    (re.compile(r"\b(?:ok|success|passed|connected|enabled)\b", re.I), "#83d68a"),
    (re.compile(r"\b0x[0-9a-f]+\b", re.I), "#f6d06f"),
    (re.compile(r"(?<![\w/-])--?[A-Za-z][A-Za-z0-9_-]*(?:=[^\s]+)?"), "#74dfe8"),
    (re.compile(r"(?<![\w.])" + _OCTET + r"(?:\." + _OCTET + r"){3}(?![\w.])"), "#ef87d7"),
)


@lru_cache(maxsize=512)
def highlight_keywords(text):
    """Return a colour for each Python character; never rewrite terminal data."""
    colours = [None] * len(text)
    for pattern, colour in _RULES:
        for match in pattern.finditer(text):
            colours[match.start():match.end()] = [colour] * (match.end() - match.start())
    return tuple(colours)
