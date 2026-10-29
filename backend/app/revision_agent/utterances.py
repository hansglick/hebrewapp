"""Phrases d'exercice des leçons 0.01 → 0.20 (déclinaison, complétion, mot, question), découpées en énoncés. Toutes
leurs données sont dans un seul fichier, revision_course.json (scripts/build_revision_course.py, cf. demande explicite
du user), dont le format est décrit dans ce script.

Chaque énoncé y garde ses champs (« he », « fr », « concepts », « subjects », « declined_prepositions »,
« vocabulary », « questions »…), plus « id » (l'identifiant de sa phrase, « leçon:index ») et « text » (= « he »).
"""

import json
import re
from functools import lru_cache

from app.config import DATA_DIR
from app.revision_agent.passages import lesson_number


@lru_cache(maxsize=1)
def utterances() -> list[tuple[str, dict]]:
    """(leçon, énoncé) pour chaque énoncé du cours, l'énoncé complété de l'identifiant de sa phrase (« leçon:index »)."""
    with open(DATA_DIR / "revision_course.json", encoding="utf-8") as f:
        phrases = json.load(f)["phrases"]
    return [(p["lesson"], {**u, "id": phrase_id, "text": u["he"]})
            for phrase_id, p in phrases.items() for u in p["utterances"]]


def lesson_utterances(lesson: str, current: bool, previous: bool) -> list[tuple[str, dict]]:
    """Énoncés de la leçon choisie et/ou des leçons antérieures, selon les cases cochées."""
    selected = lesson_number(lesson)
    if selected is None:
        return []
    return [(code, u) for code, u in utterances()
            if (n := lesson_number(code)) is not None and ((current and n == selected) or (previous and n < selected))]


# Mots qui ne font pas d'une phrase un autre exercice : « יש לרוני ספר », « אין לרוני ספר », « לרוני יש ספר »… sont
# le même exercice (cf. demande explicite du user).
SAME_EXERCISE_WORDS = {"יש", "אין", "לא"}


def sentence_key(sentence: str) -> tuple[str, ...]:
    """Ce qui distingue une phrase d'une autre au tirage : ses mots, sans ordre ni SAME_EXERCISE_WORDS."""
    return tuple(sorted(set(re.findall(r"[א-ת]+", sentence)) - SAME_EXERCISE_WORDS))


def word_span(sentence: str, word: str) -> tuple[int, int] | None:
    """Position de word dans sentence, comme mot entier (pas au milieu d'un autre mot hébreu)."""
    match = re.search(rf"(?<![א-ת]){re.escape(word)}(?![א-ת])", sentence)
    return match.span() if match else None
