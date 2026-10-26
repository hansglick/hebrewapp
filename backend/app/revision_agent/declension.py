"""Tâche « Déclinaison » : l'application tire une phrase des leçons révisées et une transformation (genre ou nombre
du sujet, personne et genre du pronom objet) ; le prof la fait faire à l'élève, juge sa réponse et donne la solution.

Les phrases viennent des énoncés analysés (cf. utterances.py), avec leur sujet et leur pronom objet.

Messages propres à la tâche (backend → navigateur, en plus de ceux de session.py) :
  {"type": "exercise", "exercise": {"lesson": str, "sentence": str, "target": [int, int]}}
        (target : début et fin, dans sentence, du sujet ou du pronom objet à modifier, à surligner)
  {"type": "answer", ...}                               (cf. correction.py)
"""

import logging
import random
from dataclasses import dataclass

from fastapi import WebSocket

from app.revision_agent import prompts
from app.revision_agent.correction import CLEAR_ANSWER, CORRECTION_TOOL, answer_message
from app.revision_agent.gemini_live import GeminiLive
from app.revision_agent.session import TeacherSession
from app.revision_agent.utterances import word_span

log = logging.getLogger("revision_agent.declension")

# Sujets qui n'ont ni genre ni nombre à changer (interrogatifs, lieux, quantités indéfinies)…
NO_SUBJECT_CHANGE = {"מי", "כולם", "פריז", "ירושלים", "כמה תלמידים"}
# … et sujets inanimés dont seul le nombre peut changer.
NO_GENDER_CHANGE = {"המכתב", "הכיתה", "המשפחה של חנה"}

# Pronom objet introduit par לְ (seule préposition présente dans les données) : forme non vocalisée → personnes.
OBJECT_PRONOUNS = {
    "לי": ["לִי"], "לך": ["לְךָ", "לָךְ"], "לו": ["לוֹ"], "לה": ["לָהּ"], "לנו": ["לָנוּ"],
    "לכם": ["לָכֶם"], "לכן": ["לָכֶן"], "להם": ["לָהֶם"], "להן": ["לָהֶן"],
}
PRONOUN_LABEL = {
    "לִי": "à moi", "לְךָ": "à toi (masculin)", "לָךְ": "à toi (féminin)", "לוֹ": "à lui", "לָהּ": "à elle",
    "לָנוּ": "à nous", "לָכֶם": "à vous (masculin)", "לָכֶן": "à vous (féminin)", "לָהֶם": "à eux", "לָהֶן": "à elles",
}


@dataclass
class Exercise:
    lesson: str
    sentence: str
    target: tuple[int, int]  # position, dans sentence, du mot à modifier
    instruction: str  # consigne transmise au prof, en français


def exercises_for(lesson: str, u: dict) -> list[Exercise]:
    """Les transformations possibles d'un énoncé."""
    sentence, found = u["text"], []
    subject = u["subject"]["he"]
    span = subject and word_span(sentence, subject)
    if span and subject not in NO_SUBJECT_CHANGE:
        found.append(Exercise(lesson, sentence, span, f"Changer le nombre du sujet « {subject} » (singulier ↔ pluriel)."))
        if subject not in NO_GENDER_CHANGE:
            found.append(Exercise(lesson, sentence, span, f"Changer le genre du sujet « {subject} » (masculin ↔ féminin)."))
    pronoun = u["object_pronoun"]
    span = pronoun in OBJECT_PRONOUNS and word_span(sentence, pronoun)
    if span:
        targets = [p for key, forms in OBJECT_PRONOUNS.items() if key != pronoun for p in forms]
        target = random.choice(targets)
        found.append(Exercise(lesson, sentence, span,
                              f"Remplacer le pronom objet « {pronoun} » par « {target} » ({PRONOUN_LABEL[target]})."))
    return found


NEXT_SENTENCE_TOOL = {
    "name": "phrase_suivante",
    "description": "Tire la phrase à décliner suivante et l'affiche à l'écran de l'élève ; renvoie la phrase et la consigne.",
    # Bloquante (comportement par défaut) : le prof attend la phrase avant de donner la consigne.
}


class DeclensionSession(TeacherSession):
    def __init__(self, browser: WebSocket, voice: str, lesson: str, pool: list[tuple[str, dict]]):
        self.lesson = lesson
        self.pool = pool
        self.used: set[str] = set()  # phrases déjà proposées dans la séance
        super().__init__(browser, GeminiLive(voice, prompts.DECLENSION_INSTRUCTIONS, prompts.DECLENSION_START,
                                             [NEXT_SENTENCE_TOOL, CORRECTION_TOOL]))

    async def on_started(self) -> None:
        log.info("Séance de déclinaison lancée · voix %s · leçon %s · %d énoncés", self.live.voice, self.lesson,
                 len(self.pool))

    def draw(self) -> Exercise | None:
        """Une seule transformation par exercice, sur une phrase pas encore proposée (sinon, on recommence le tour)."""
        candidates = [(code, u) for code, u in self.pool if u["text"] not in self.used] or self.pool
        random.shuffle(candidates)
        for code, u in candidates:
            if options := exercises_for(code, u):
                self.used.add(u["text"])
                return random.choice(options)
        return None

    async def on_tool_call(self, call: dict) -> None:
        if call["name"] == NEXT_SENTENCE_TOOL["name"]:
            exercise = self.draw()
            if exercise is None:
                await self.live.tool_response(call["id"], call["name"], {"erreur": "aucune phrase disponible"})
                return
            log.info("exercice : %s · %s", exercise.sentence, exercise.instruction)
            await self.to_browser(CLEAR_ANSWER)
            await self.to_browser({"type": "exercise", "exercise": {
                "lesson": exercise.lesson, "sentence": exercise.sentence, "target": list(exercise.target),
            }})
            await self.live.tool_response(call["id"], call["name"], {
                "phrase": exercise.sentence, "consigne": exercise.instruction,
            })
        elif call["name"] == CORRECTION_TOOL["name"]:
            await self.to_browser(answer_message(call["args"]))
            await self.live.tool_response(call["id"], call["name"], {"resultat": "correction affichée"}, silent=True)
        else:
            await super().on_tool_call(call)
