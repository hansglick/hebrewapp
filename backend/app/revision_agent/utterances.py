"""Phrases des leçons 0.01 → 0.20 découpées en énoncés et analysées (déclinaison, complétion) :
revision_phrase_analysis.json, copie de livecoach/specific_data/phrase_analysis.json.

Chaque énoncé : {"text", "concepts": [{"id": leçon du concept, "words": [mots du texte qui le portent]}],
"action": {"fr", "he"}, "subject": {"fr", "he"}, "preposition", "object_pronoun"}.
"""

import json
import re
from functools import lru_cache

from app.config import DATA_DIR
from app.revision_agent.passages import lesson_number


@lru_cache(maxsize=1)
def utterances() -> list[tuple[str, dict]]:
    """(leçon, énoncé) pour chaque énoncé analysé, l'énoncé complété de l'identifiant de sa phrase (« leçon:index »)."""
    with open(DATA_DIR / "revision_phrase_analysis.json", encoding="utf-8") as f:
        analysis = json.load(f)
    return [(phrase_id.split(":")[0], {**u, "id": phrase_id}) for phrase_id, items in analysis.items() for u in items]


def lesson_utterances(lesson: str, current: bool, previous: bool) -> list[tuple[str, dict]]:
    """Énoncés de la leçon choisie et/ou des leçons antérieures, selon les cases cochées."""
    selected = lesson_number(lesson)
    if selected is None:
        return []
    return [(code, u) for code, u in utterances()
            if (n := lesson_number(code)) is not None and ((current and n == selected) or (previous and n < selected))]


def word_span(sentence: str, word: str) -> tuple[int, int] | None:
    """Position de word dans sentence, comme mot entier (pas au milieu d'un autre mot hébreu)."""
    match = re.search(rf"(?<![א-ת]){re.escape(word)}(?![א-ת])", sentence)
    return match.span() if match else None
