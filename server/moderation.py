"""
Chat word moderation — a simple, editable denylist.

Built through an iterative collaboration between Elisa Schaeffer (Dean of
Technology and Design, Collège LaSalle Montréal) and Claude (Anthropic).
See client/index.html's footer for the full attribution note.

Deliberately NOT tied to session save/restore/reset: moderation is an
ongoing configuration concern, not part of any one class's live activity,
so it survives independently of whatever session is currently loaded.

The shipped moderation_defaults.json is a short starting point, not an
exhaustive moderation-grade list — add whatever your context needs via
`control.py moderation add <word>`.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

DEFAULTS_FILE = Path(__file__).parent.parent / "moderation_defaults.json"


def _load_words_from(path: Path) -> list[str]:
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    return [str(w).strip() for w in data.get("words", []) if str(w).strip()]


class ModerationList:
    """Whole-word, case-insensitive denylist used to filter chat messages."""

    def __init__(self):
        self.words: set[str] = set()
        self._pattern: re.Pattern | None = None
        self.load_defaults()

    def _rebuild_pattern(self) -> None:
        if not self.words:
            self._pattern = None
            return
        # longest-first so a multi-word phrase matches before a shorter word inside it
        alternation = "|".join(re.escape(w) for w in sorted(self.words, key=len, reverse=True))
        self._pattern = re.compile(rf"\b(?:{alternation})\b", re.IGNORECASE)

    def load_defaults(self) -> None:
        self.words = set(_load_words_from(DEFAULTS_FILE))
        self._rebuild_pattern()

    def load_words(self, words: list[str]) -> None:
        self.words = {str(w).strip() for w in words if str(w).strip()}
        self._rebuild_pattern()

    def add(self, word: str) -> bool:
        word = word.strip()
        if not word or word.lower() in {w.lower() for w in self.words}:
            return False
        self.words.add(word)
        self._rebuild_pattern()
        return True

    def remove(self, word: str) -> bool:
        match = next((w for w in self.words if w.lower() == word.strip().lower()), None)
        if not match:
            return False
        self.words.discard(match)
        self._rebuild_pattern()
        return True

    def contains_blocked_word(self, text: str) -> bool:
        return bool(self._pattern and self._pattern.search(text))

    def to_list(self) -> list[str]:
        return sorted(self.words, key=str.lower)

    def save_to(self, path: Path) -> None:
        path.write_text(
            json.dumps({"words": self.to_list()}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
