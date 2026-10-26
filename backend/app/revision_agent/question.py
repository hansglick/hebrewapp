"""Tâche « Question » : l'application tire une affirmation des leçons révisées et l'affiche à l'écran avec un indice
(un groupe interrogatif en français : « où ? », « à qui ? ») ; l'élève doit poser la question qui a cette phrase pour
réponse. Le prof juge la question, puis la question modèle s'affiche toujours.

Les couples (indice, question modèle) viennent de revision_questions.json, préparé par Sol
(scripts/build_revision_questions.py) : la question modèle n'emploie que la matière des leçons ≤ celle de la phrase.

Messages propres à la tâche (backend → navigateur, en plus de ceux de session.py) :
  {"type": "exercise", "exercise": {"lesson": str, "sentence": str, "hint": str}}
  {"type": "solution", "solution": {"sentence": str, "spans": []} | null}   (la question modèle)
  {"type": "answer", ...}                                                  (cf. correction.py)
"""

import json
import logging
import random
from dataclasses import dataclass
from functools import lru_cache

from fastapi import WebSocket

from app.config import DATA_DIR
from app.revision_agent import prompts
from app.revision_agent.correction import CLEAR_ANSWER, CORRECTION_TOOL, answer_message
from app.revision_agent.gemini_live import GeminiLive
from app.revision_agent.session import TeacherSession

log = logging.getLogger("revision_agent.question")


@dataclass
class Exercise:
    lesson: str
    sentence: str  # la réponse affichée
    hint: str  # groupe interrogatif, en français
    question: str  # question modèle, en hébreu


@lru_cache(maxsize=1)
def model_questions() -> dict[str, list[dict]]:
    with open(DATA_DIR / "revision_questions.json", encoding="utf-8") as f:
        return json.load(f)


def exercises_for(lesson: str, u: dict) -> list[Exercise]:
    """Un exercice par question modèle de l'énoncé (aucune pour une phrase qui est déjà une question)."""
    entries = [e for e in model_questions().get(u["id"], []) if e["text"] == u["text"]]
    return [Exercise(lesson, u["text"], q["hint"], q["question"]) for e in entries for q in e["questions"]]


NEXT_QUESTION_TOOL = {
    "name": "question_suivante",
    "description": "Tire la phrase suivante et l'affiche à l'écran de l'élève avec l'indice ; "
                   "renvoie la phrase, l'indice et la question modèle.",
    # Bloquante (comportement par défaut) : le prof attend la phrase avant de donner la consigne.
}


class QuestionSession(TeacherSession):
    def __init__(self, browser: WebSocket, voice: str, lesson: str, pool: list[tuple[str, dict]]):
        self.lesson = lesson
        self.exercises = [e for code, u in pool for e in exercises_for(code, u)]
        self.used: set[tuple[str, str]] = set()  # (phrase, question) déjà proposées dans la séance
        self.exercise: Exercise | None = None
        super().__init__(browser, GeminiLive(voice, prompts.QUESTION_INSTRUCTIONS, prompts.QUESTION_START,
                                             [NEXT_QUESTION_TOOL, CORRECTION_TOOL]))

    async def on_started(self) -> None:
        log.info("Séance « question » lancée · voix %s · leçon %s · %d exercices", self.live.voice, self.lesson,
                 len(self.exercises))

    def draw(self) -> Exercise:
        """Un couple (phrase, question) pas encore proposé dans la séance (sinon, on recommence le tour)."""
        fresh = [e for e in self.exercises if (e.sentence, e.question) not in self.used] or self.exercises
        exercise = random.choice(fresh)
        self.used.add((exercise.sentence, exercise.question))
        return exercise

    async def on_tool_call(self, call: dict) -> None:
        if call["name"] == NEXT_QUESTION_TOOL["name"]:
            exercise = self.exercise = self.draw()
            log.info("exercice : %s · %s · %s", exercise.sentence, exercise.hint, exercise.question)
            await self.to_browser(CLEAR_ANSWER)
            await self.to_browser({"type": "solution", "solution": None})
            await self.to_browser({"type": "exercise", "exercise": {
                "lesson": exercise.lesson, "sentence": exercise.sentence, "hint": exercise.hint,
            }})
            await self.live.tool_response(call["id"], call["name"], {
                "phrase": exercise.sentence, "indice": exercise.hint, "question_modele": exercise.question,
            })
        elif call["name"] == CORRECTION_TOOL["name"]:
            await self.to_browser(answer_message(call["args"]))
            # La question modèle s'affiche toujours, quelle que soit la réponse (cf. demande explicite du user).
            if self.exercise:
                await self.to_browser({"type": "solution", "solution": {"sentence": self.exercise.question, "spans": []}})
            await self.live.tool_response(call["id"], call["name"], {"resultat": "correction affichée"}, silent=True)
        else:
            await super().on_tool_call(call)
