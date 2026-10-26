"""Tâche « Complétion » : l'application tire une phrase des leçons révisées et l'un de ses concepts, puis la tronque
à partir des mots qui portent ce concept ; l'élève doit la compléter en suivant l'indice (action de la phrase et
concept à pratiquer). Le prof juge la réponse, puis la phrase d'origine s'affiche, mots du concept surlignés.

Messages propres à la tâche (backend → navigateur, en plus de ceux de session.py) :
  {"type": "exercise", "exercise": {"lesson": str, "prefix": str, "hint": {"action": str, "concept": str}}}
  {"type": "solution", "solution": {"sentence": str, "spans": [[int, int]]} | null}
        (spans : positions, dans sentence, des mots du concept, à surligner)
  {"type": "answer", ...}                               (cf. correction.py)
"""

import logging
import random
import re
from dataclasses import dataclass

from fastapi import WebSocket

from app.data_loader import get_dataset
from app.revision_agent import prompts
from app.revision_agent.correction import CLEAR_ANSWER, CORRECTION_TOOL, answer_message
from app.revision_agent.gemini_live import GeminiLive
from app.revision_agent.session import TeacherSession

log = logging.getLogger("revision_agent.completion")

HEBREW_LETTER = re.compile(r"[א-ת]")
TRAILING = re.compile(r"[\s,:;\-–—]+$")  # ponctuation laissée en fin de début de phrase


@dataclass
class Exercise:
    lesson: str
    sentence: str
    prefix: str  # début de la phrase, affiché
    spans: list[tuple[int, int]]  # positions des mots du concept dans sentence
    action: str  # action de la phrase, en français (peut être vide)
    concept: str  # intitulé du concept à pratiquer, en français


def concept_title(concept_id: str) -> str:
    concept = get_dataset("concept").get(concept_id) or {}
    return (concept.get("concept") or "").strip().rstrip(".")


def exercises_for(lesson: str, u: dict) -> list[Exercise]:
    """Un exercice par concept de l'énoncé, tronqué au premier mot qui le porte ; écarté s'il ne reste aucun mot
    à afficher (concept en tout début de phrase, cf. demande explicite du user)."""
    sentence, found = u["text"], []
    for concept in u["concepts"]:
        title = concept_title(concept["id"])
        spans = [(start, start + len(w)) for w in concept["words"] if (start := sentence.find(w)) >= 0]
        if not title or not spans:
            continue
        prefix = TRAILING.sub("", sentence[: min(start for start, _ in spans)])
        if HEBREW_LETTER.search(prefix):
            found.append(Exercise(lesson, sentence, prefix, sorted(spans), u["action"]["fr"], title))
    return found


NEXT_EXERCISE_TOOL = {
    "name": "exercice_suivant",
    "description": "Tire la phrase à compléter suivante et affiche son début et l'indice à l'écran de l'élève ; "
                   "renvoie la phrase complète, son début, l'indice et les mots du concept.",
    # Bloquante (comportement par défaut) : le prof attend l'exercice avant de donner la consigne.
}


class CompletionSession(TeacherSession):
    def __init__(self, browser: WebSocket, voice: str, lesson: str, pool: list[tuple[str, dict]]):
        self.lesson = lesson
        self.pool = pool
        self.used: set[tuple[str, str]] = set()  # (phrase, concept) déjà proposés dans la séance
        self.exercise: Exercise | None = None
        super().__init__(browser, GeminiLive(voice, prompts.COMPLETION_INSTRUCTIONS, prompts.COMPLETION_START,
                                             [NEXT_EXERCISE_TOOL, CORRECTION_TOOL]))

    async def on_started(self) -> None:
        log.info("Séance de complétion lancée · voix %s · leçon %s · %d énoncés", self.live.voice, self.lesson,
                 len(self.pool))

    def draw(self) -> Exercise | None:
        """Un exercice pas encore proposé dans la séance (sinon, on recommence le tour)."""
        options = [e for code, u in self.pool for e in exercises_for(code, u)]
        fresh = [e for e in options if (e.sentence, e.concept) not in self.used] or options
        if not fresh:
            return None
        exercise = random.choice(fresh)
        self.used.add((exercise.sentence, exercise.concept))
        return exercise

    async def on_tool_call(self, call: dict) -> None:
        if call["name"] == NEXT_EXERCISE_TOOL["name"]:
            exercise = self.exercise = self.draw()
            if exercise is None:
                await self.live.tool_response(call["id"], call["name"], {"erreur": "aucune phrase disponible"})
                return
            log.info("exercice : %s → %s · concept %s", exercise.prefix, exercise.sentence, exercise.concept)
            await self.to_browser(CLEAR_ANSWER)
            await self.to_browser({"type": "solution", "solution": None})
            await self.to_browser({"type": "exercise", "exercise": {
                "lesson": exercise.lesson, "prefix": exercise.prefix,
                "hint": {"action": exercise.action, "concept": exercise.concept},
            }})
            await self.live.tool_response(call["id"], call["name"], {
                "debut_affiche": exercise.prefix,
                "phrase_complete": exercise.sentence,
                "mots_du_concept": [exercise.sentence[a:b] for a, b in exercise.spans],
                "indice": {"action": exercise.action or "(aucune)", "concept": exercise.concept},
            })
        elif call["name"] == CORRECTION_TOOL["name"]:
            await self.to_browser(answer_message(call["args"]))
            # La réponse plausible affichée est la phrase d'origine, mots du concept surlignés (cf. demande explicite du user).
            if self.exercise:
                await self.to_browser({"type": "solution", "solution": {
                    "sentence": self.exercise.sentence, "spans": [list(span) for span in self.exercise.spans],
                }})
            await self.live.tool_response(call["id"], call["name"], {"resultat": "correction affichée"}, silent=True)
        else:
            await super().on_tool_call(call)
