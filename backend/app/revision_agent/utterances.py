"""Phrases d'exercice des leçons 0.01 → 0.20 (déclinaison, complétion, mot, question), découpées en énoncés et
analysées. Deux pools, tirés de revision_phrase_analysis.json (copie de livecoach/specific_data/phrase_analysis.json),
cf. demande explicite du user :
- revision_concept_pool.json : les énoncés qui portent l'un des concepts retenus (scripts/build_revision_concept_pool.py) ;
- revision_svc_pool.json : parmi les autres, ceux qui ont au moins un sujet, un verbe et un complément
  (choisis par Sol, scripts/build_revision_svc_pool.py).

Chaque énoncé : {"text", "concepts": [{"id": leçon du concept, "title", "words": [mots du texte qui le portent]}],
"action": {"fr", "he"}, "subject": {"fr", "he"}, "preposition": [toutes les prépositions],
"object_pronoun": [toutes les prépositions déclinées : לי, אותו…]}.
"""

import json
import re
from functools import lru_cache

from app.config import DATA_DIR
from app.revision_agent.passages import lesson_number


@lru_cache(maxsize=1)
def utterances() -> list[tuple[str, dict]]:
    """(leçon, énoncé) pour chaque énoncé des deux pools, l'énoncé complété de l'identifiant de sa phrase (« leçon:index »)."""
    found = []
    for name in ("revision_concept_pool.json", "revision_svc_pool.json"):
        with open(DATA_DIR / name, encoding="utf-8") as f:
            pool = json.load(f)
        found += [(phrase_id.split(":")[0], {**u, "id": phrase_id}) for phrase_id, items in pool.items() for u in items]
    return found


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
