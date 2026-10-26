"""Tâche « Compréhension de texte » : le prof (seul, sans autre modèle) fait afficher le texte de la leçon une fois
la consigne donnée, puis pose des questions en boucle, juge chaque réponse, donne la solution et fait surligner
la phrase qui la contient.

Messages propres à la tâche (backend → navigateur, en plus de ceux de session.py) :
  {"type": "text", "lesson": str, "title": str, "phrases": [str]}
  {"type": "highlight", "phrases": [int]}               (indices dans phrases ; [] = plus rien de surligné)
"""

import logging

from fastapi import WebSocket

from app.data_loader import get_dataset
from app.revision_agent import prompts
from app.revision_agent.gemini_live import GeminiLive
from app.revision_agent.session import TeacherSession

log = logging.getLogger("revision_agent.comprehension")

TEXT_FALLBACK_SECONDS = 60  # si le prof n'a toujours pas fait afficher le texte

TEXT_TOOL = {
    "name": "afficher_texte",
    "description": "Affiche le texte de la leçon à l'écran de l'élève.",
    # Non bloquante : sa réponse peut être marquée SILENT, pour que le prof ne l'annonce pas.
    "behavior": "NON_BLOCKING",
}

HIGHLIGHT_TOOL = {
    "name": "surligner_phrases",
    "description": "Surligne, dans le texte affiché à l'écran de l'élève, la ou les phrases qui contiennent la solution.",
    "parameters": {
        "type": "OBJECT",
        "properties": {"phrases": {
            "type": "ARRAY", "items": {"type": "INTEGER"},
            "description": "Numéros des phrases du texte (tels qu'ils figurent dans tes instructions)",
        }},
        "required": ["phrases"],
    },
    # Non bloquante : le prof continue de parler pendant que la phrase s'allume.
    "behavior": "NON_BLOCKING",
}


class ComprehensionSession(TeacherSession):
    def __init__(self, browser: WebSocket, voice: str, lesson: str):
        text = get_dataset("text")[lesson]
        self.lesson = lesson
        self.title = text.get("title", "")
        self.phrases = [p["hebrew"] for p in text["phrases"]]
        questions = [q["hebrew"] for q in text.get("questions") or []]
        instructions = prompts.comprehension_instructions(self.phrases, questions)
        super().__init__(browser, GeminiLive(voice, instructions, prompts.COMPREHENSION_START, [TEXT_TOOL, HIGHLIGHT_TOOL]))
        self.text_shown = False
        self.highlighted: list[int] = []

    async def on_started(self) -> None:
        log.info("Séance de compréhension lancée · voix %s · leçon %s", self.live.voice, self.lesson)

    async def show_text(self) -> None:
        self.text_shown = True
        await self.to_browser({"type": "text", "lesson": self.lesson, "title": self.title, "phrases": self.phrases})

    async def tick(self, now: float) -> None:
        if not self.text_shown and now - self.started_at > TEXT_FALLBACK_SECONDS:
            log.info("pas de demande de texte : affichage spontané")
            await self.show_text()
            await self.live.note(prompts.TEXT_SHOWN)

    async def on_user_text(self, text: str) -> None:
        # L'élève répond à la question suivante : la solution précédente n'est plus surlignée.
        if self.highlighted:
            await self.highlight([])

    async def on_tool_call(self, call: dict) -> None:
        if call["name"] == TEXT_TOOL["name"]:
            if not self.text_shown:
                await self.show_text()
            await self.live.tool_response(call["id"], call["name"], {"consigne": prompts.TEXT_SHOWN}, silent=True)
        elif call["name"] == HIGHLIGHT_TOOL["name"]:
            numbers = call["args"].get("phrases") or []
            # Les phrases sont numérotées à partir de 1 dans les instructions du prof.
            indices = sorted({int(n) - 1 for n in numbers if isinstance(n, (int, float)) and 1 <= n <= len(self.phrases)})
            if not self.text_shown:
                await self.show_text()
            await self.highlight(indices)
            await self.live.tool_response(call["id"], call["name"], {"resultat": "phrases surlignées"}, silent=True)
        else:
            await super().on_tool_call(call)

    async def highlight(self, indices: list[int]) -> None:
        self.highlighted = indices
        await self.to_browser({"type": "highlight", "phrases": indices})
