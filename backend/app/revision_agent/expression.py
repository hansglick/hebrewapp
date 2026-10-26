"""Tâche « Expression libre » : le prof (seul, sans autre modèle) pose en boucle des questions de mise en situation
qui amènent l'élève à construire une phrase avec le vocabulaire des leçons révisées. Il ne juge que la construction
de la phrase (sens plausible, grammaire), jamais sa véracité, puis donne une solution.

Pendant que l'élève parle, rien ne s'affiche : seule la phrase telle que le prof l'a comprise apparaît, au moment
de la correction, avec les mots fautifs et la mention réussi / échec.

Messages propres à la tâche (backend → navigateur, en plus de ceux de session.py) :
  {"type": "hint", "words": [str]}                      (indice de la question en cours, en hébreu ; [] = aucun)
  {"type": "answer", ...}                               (cf. correction.py)
"""

import logging

from fastapi import WebSocket

from app.revision_agent import prompts
from app.revision_agent.correction import CLEAR_ANSWER, CORRECTION_TOOL, answer_message
from app.revision_agent.gemini_live import GeminiLive
from app.revision_agent.session import TeacherSession

log = logging.getLogger("revision_agent.expression")

HINT_TOOL = {
    "name": "afficher_indice",
    "description": "Affiche à l'écran de l'élève l'indice de la question que tu poses : quelques mots du vocabulaire autorisé.",
    "parameters": {
        "type": "OBJECT",
        "properties": {"mots": {
            "type": "ARRAY", "items": {"type": "INTEGER"},
            "description": "Numéros de 1 à 3 mots de la liste « Vocabulaire autorisé » de tes instructions",
        }},
        "required": ["mots"],
    },
    "behavior": "NON_BLOCKING",
}

class ExpressionSession(TeacherSession):
    def __init__(self, browser: WebSocket, voice: str, lesson: str, vocabulary: list[dict]):
        self.lesson = lesson
        self.vocabulary = vocabulary
        instructions = prompts.expression_instructions(vocabulary)
        super().__init__(browser, GeminiLive(voice, instructions, prompts.EXPRESSION_START, [HINT_TOOL, CORRECTION_TOOL]))

    async def on_started(self) -> None:
        log.info("Séance d'expression libre lancée · voix %s · leçon %s · %d mots", self.live.voice, self.lesson,
                 len(self.vocabulary))

    async def on_tool_call(self, call: dict) -> None:
        if call["name"] == HINT_TOOL["name"]:
            # Seuls les mots de la liste peuvent s'afficher (cf. demande explicite du user : l'indice doit
            # appartenir au vocabulaire des leçons révisées) ; les numéros sont comptés à partir de 1.
            numbers = [int(n) for n in call["args"].get("mots") or [] if isinstance(n, (int, float))]
            words = list(dict.fromkeys(self.vocabulary[n - 1]["hebrew"] for n in numbers if 1 <= n <= len(self.vocabulary)))
            # Nouvelle question : la réponse précédente disparaît avec l'ancien indice.
            await self.to_browser(CLEAR_ANSWER)
            await self.to_browser({"type": "hint", "words": words[:3]})
            await self.live.tool_response(call["id"], call["name"], {"resultat": "indice affiché"}, silent=True)
        elif call["name"] == CORRECTION_TOOL["name"]:
            await self.to_browser(answer_message(call["args"]))
            await self.live.tool_response(call["id"], call["name"], {"resultat": "correction affichée"}, silent=True)
        else:
            await super().on_tool_call(call)
