"""Tâche « Mot » : l'application tire une phrase des leçons révisées et un mot (ou un verbe) du vocabulaire qu'elle
contient ; l'élève doit construire une phrase avec ce mot en suivant l'indice (l'action de la phrase ou l'un de ses
concepts). Le prof juge la réponse, puis la phrase d'origine s'affiche toujours, le mot surligné.

Les occurrences viennent de revision_vocab_occurrences.json, tiré des analyses de Sol (livecoach/samples/
word_phrase_map) : pour chaque phrase, la forme de base de chaque mot ou verbe du vocabulaire et sa forme dans la phrase.

Messages propres à la tâche (backend → navigateur, en plus de ceux de session.py) :
  {"type": "exercise", "exercise": {"lesson": str, "word": str, "french": str, "kind": "mot" | "verbe",
                                    "hint": {"type": "action" | "concept", "text": str}}}
  {"type": "solution", "solution": {"sentence": str, "spans": [[int, int]]} | null}
  {"type": "answer", ...}                               (cf. correction.py)
"""

import json
import logging
import random
from dataclasses import dataclass
from functools import lru_cache

from fastapi import WebSocket

from app.config import DATA_DIR
from app.data_loader import get_dataset
from app.revision_agent import prompts
from app.revision_agent.completion import concept_title
from app.revision_agent.correction import CLEAR_ANSWER, CORRECTION_TOOL, answer_message
from app.revision_agent.gemini_live import GeminiLive
from app.revision_agent.material import vocabulary
from app.revision_agent.passages import lesson_number
from app.revision_agent.session import TeacherSession
from app.revision_agent.utterances import word_span

log = logging.getLogger("revision_agent.word")


@dataclass
class Exercise:
    lesson: str
    sentence: str
    span: tuple[int, int]  # position du mot dans sentence
    word: str  # forme de base, avec nikkoud (infinitif pour un verbe)
    french: str
    kind: str  # "mot" | "verbe"
    hint_type: str  # "action" | "concept"
    hint: str  # en français


@lru_cache(maxsize=1)
def occurrences() -> dict[str, list[dict]]:
    with open(DATA_DIR / "revision_vocab_occurrences.json", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def lexicon() -> dict[tuple[str, str], dict]:
    """(forme de base sans nikkoud ni espace, "mot" | "verbe") → {"hebrew", "french", "level"} (item_word, item_verbe)."""
    entries = {}
    for name, kind, french_field in (("word", "mot", "french"), ("verbe", "verbe", "traduction")):
        for item in get_dataset(name).values():
            level = lesson_number(f"{item.get('chapter')}.{item.get('lesson')}")
            if level is not None:
                hebrew = item["original"].replace("?", "").strip()
                if kind == "verbe":  # certains infinitifs ont des espaces entre les lettres (« לְ קָ רֵ ר »)
                    hebrew = hebrew.replace(" ", "")
                entries[(item["pure"], kind)] = {"hebrew": hebrew, "french": item[french_field], "level": level}
    return entries


def exercises_for(lesson: str, u: dict, max_level: int) -> list[Exercise]:
    """Un exercice par mot ou verbe du vocabulaire (de niveau ≤ max_level) présent dans l'énoncé, avec un indice tiré
    au hasard entre l'action de la phrase et l'un de ses concepts (cf. demande explicite du user)."""
    hints = [("action", u["action"]["fr"])] if u["action"]["fr"] else []
    hints += [("concept", title) for c in u["concepts"] if (title := concept_title(c["id"]))]
    if not hints:
        return []
    found = []
    for occurrence in occurrences().get(u["id"], []):
        entry = lexicon().get((occurrence["key"].replace(" ", ""), occurrence["kind"]))
        span = word_span(u["text"], occurrence["surface"])
        if entry and span and entry["level"] <= max_level:
            hint_type, hint = random.choice(hints)
            found.append(Exercise(lesson, u["text"], span, entry["hebrew"], entry["french"], occurrence["kind"],
                                  hint_type, hint))
    return found


NEXT_WORD_TOOL = {
    "name": "mot_suivant",
    "description": "Tire le mot suivant et l'affiche à l'écran de l'élève avec sa traduction et l'indice ; "
                   "renvoie le mot, sa traduction, l'indice et la phrase d'origine.",
    # Bloquante (comportement par défaut) : le prof attend le mot avant de donner la consigne.
}


class WordSession(TeacherSession):
    def __init__(self, browser: WebSocket, voice: str, lesson: str, pool: list[tuple[str, dict]]):
        self.lesson = lesson
        self.max_level = lesson_number(lesson)
        self.pool = pool
        self.used: set[tuple[str, str]] = set()  # (phrase, mot) déjà proposés dans la séance
        self.exercise: Exercise | None = None
        # Le prof juge si la réponse ne sort pas de la matière des leçons ≤ celle choisie : il la reçoit en entier.
        concepts = [title for n in range(1, self.max_level + 1) if (title := concept_title(f"0.{n:02d}"))]
        instructions = prompts.word_instructions(vocabulary(lesson, True, True), concepts)
        super().__init__(browser, GeminiLive(voice, instructions, prompts.WORD_START, [NEXT_WORD_TOOL, CORRECTION_TOOL]))

    async def on_started(self) -> None:
        log.info("Séance « mot » lancée · voix %s · leçon %s · %d énoncés", self.live.voice, self.lesson, len(self.pool))

    def draw(self) -> Exercise | None:
        """Un couple (phrase, mot) pas encore proposé dans la séance (sinon, on recommence le tour)."""
        options = [e for code, u in self.pool for e in exercises_for(code, u, self.max_level)]
        fresh = [e for e in options if (e.sentence, e.word) not in self.used] or options
        if not fresh:
            return None
        exercise = random.choice(fresh)
        self.used.add((exercise.sentence, exercise.word))
        return exercise

    async def on_tool_call(self, call: dict) -> None:
        if call["name"] == NEXT_WORD_TOOL["name"]:
            exercise = self.exercise = self.draw()
            if exercise is None:
                await self.live.tool_response(call["id"], call["name"], {"erreur": "aucun mot disponible"})
                return
            log.info("exercice : %s (%s) · %s %s · %s", exercise.word, exercise.french, exercise.hint_type,
                     exercise.hint, exercise.sentence)
            await self.to_browser(CLEAR_ANSWER)
            await self.to_browser({"type": "solution", "solution": None})
            await self.to_browser({"type": "exercise", "exercise": {
                "lesson": exercise.lesson, "word": exercise.word, "french": exercise.french, "kind": exercise.kind,
                "hint": {"type": exercise.hint_type, "text": exercise.hint},
            }})
            await self.live.tool_response(call["id"], call["name"], {
                "mot": exercise.word, "nature": exercise.kind, "traduction": exercise.french,
                "indice": f"{'action' if exercise.hint_type == 'action' else 'concept'} : {exercise.hint}",
                "phrase_origine": exercise.sentence,
            })
        elif call["name"] == CORRECTION_TOOL["name"]:
            await self.to_browser(answer_message(call["args"]))
            # La phrase d'origine s'affiche toujours, quelle que soit la réponse (cf. demande explicite du user).
            if self.exercise:
                await self.to_browser({"type": "solution", "solution": {
                    "sentence": self.exercise.sentence, "spans": [list(self.exercise.span)],
                }})
            await self.live.tool_response(call["id"], call["name"], {"resultat": "correction affichée"}, silent=True)
        else:
            await super().on_tool_call(call)
