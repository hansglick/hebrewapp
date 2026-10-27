"""Tâche « Compréhension de texte » : le prof (seul, sans autre modèle) fait afficher le texte de la leçon, puis pose
trois questions sur ce texte. Il ne les choisit pas, ni le moment de les poser : l'application les tire, les lui
donne et les affiche comme une consigne. Il évalue chaque réponse en silence, sur deux dimensions (langue et
compréhension, de 0 à 5 étoiles, justifiées), sans la commenter ; l'élève relit l'évaluation et passe lui-même à la
question suivante (cf. demande explicite du user).

Seule la première question est demandée par le prof (question_suivante, quand l'élève a lu le texte) ; les suivantes
lui sont envoyées par l'application quand l'élève appuie sur « Question suivante ». Il ne peut donc jamais enchaîner
de lui-même sur une question.

Messages propres à la tâche (backend → navigateur, en plus de ceux de session.py) :
  {"type": "text", "lesson": str, "title": str, "phrases": [str]}
  {"type": "highlight", "phrases": [int], "excerpts": [[int, int, int]]}
        (phrases qui contiennent la solution, et dans ces phrases l'extrait exact qui y répond : [phrase, début, fin] ;
         [] = plus rien de surligné)
  {"type": "question", "question": {"number": int, "hebrew": str} | null}
        (sans traduction, quand le prof commence à la poser)
  {"type": "evaluation", "evaluation": {"answer": str, "errors": [{"word": str, "comment": str}],
                                        "language": {"stars": int, "justification": str},
                                        "comprehension": {"stars": int, "justification": str}} | null}
  {"type": "pause", "paused": bool}                     (évaluation affichée : question suivante en attente de l'élève)
  {"type": "phase", "phase": "done"}                    (toutes les questions ont été posées)
Navigateur → backend : {"type": "next"} (question suivante).
"""

import logging
import random
import re
import time

from fastapi import WebSocket

from app.data_loader import get_dataset
from app.revision_agent import prompts
from app.revision_agent.gemini_live import GeminiLive
from app.revision_agent.session import TeacherSession

log = logging.getLogger("revision_agent.comprehension")

TEXT_FALLBACK_SECONDS = 60  # si le prof n'a toujours pas fait afficher le texte
QUESTIONS_PER_ROUND = 3  # comme le prototype /dev/topic-prototype (cf. demande explicite du user)
QUESTION_FALLBACK_SECONDS = 4  # si le prof n'a toujours pas commencé à poser la question
MAX_STARS = 5
NIKKUD = re.compile(r"[\u0591-\u05c7]")

TEXT_TOOL = {
    "name": "afficher_texte",
    "description": "Affiche le texte de la leçon à l'écran de l'élève.",
    # Bloquante (comportement par défaut), appelée avant la consigne : le prof n'a encore rien dit qu'il pourrait
    # répéter en reprenant la parole après la fonction.
}

NEXT_QUESTION_TOOL = {
    "name": "question_suivante",
    "description": "Demande à l'application la première question, qu'elle affiche à l'écran de l'élève ; "
                   "renvoie la question à lui poser.",
    # Bloquante : le prof attend la question avant de la poser.
}

STARS = {"type": "INTEGER", "description": "De 0 à 5 étoiles"}
JUSTIFICATION = {"type": "STRING",
                 "description": "En français, en une ou deux phrases courtes, pourquoi la note n'est pas de 5 étoiles "
                                "(vide si elle l'est)"}

EVALUATION_TOOL = {
    "name": "evaluer_reponse",
    "description": "Affiche à l'écran de l'élève l'évaluation de sa réponse : sa réponse, ses fautes commentées, "
                   "ses deux notes justifiées, et surligne dans le texte la ou les phrases qui contiennent la solution.",
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "reponse_eleve": {
                "type": "STRING",
                "description": "La réponse de l'élève en écriture hébraïque, exactement telle que tu l'as entendue, "
                               "fautes comprises, sans la corriger (vide s'il n'a rien répondu)",
            },
            "fautes": {
                "type": "ARRAY",
                "description": "Chaque faute de langue de la réponse, dans l'ordre",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "mot": {"type": "STRING",
                                "description": "Le mot fautif, recopié exactement tel qu'il est écrit dans reponse_eleve"},
                        "commentaire": {"type": "STRING",
                                        "description": "En français, en une phrase courte : la nature de la faute et "
                                                       "la forme correcte (en hébreu)"},
                    },
                    "required": ["mot", "commentaire"],
                },
            },
            "note_langue": STARS,
            "justification_langue": JUSTIFICATION,
            "note_comprehension": STARS,
            "justification_comprehension": JUSTIFICATION,
            "phrases_solution": {
                "type": "ARRAY", "items": {"type": "INTEGER"},
                "description": "Numéros des phrases du texte qui contiennent la solution (tels qu'ils figurent dans "
                               "tes instructions)",
            },
            "extraits_solution": {
                "type": "ARRAY", "items": {"type": "STRING"},
                "description": "Le ou les extraits du texte qui permettent de répondre correctement à la question, "
                               "recopiés exactement tels qu'ils y sont écrits : seulement les mots utiles, pas toute "
                               "la phrase",
            },
        },
        "required": ["reponse_eleve", "fautes", "note_langue", "justification_langue", "note_comprehension",
                     "justification_comprehension", "phrases_solution", "extraits_solution"],
    },
    "behavior": "NON_BLOCKING",
}


def find_excerpts(phrases: list[str], excerpts: list[str]) -> list[list[int]]:
    """Position de chaque extrait dans le texte, [phrase, début, fin], en ignorant nikkoud et ponctuation autour ;
    un extrait introuvable est ignoré."""
    spans = []
    for excerpt in excerpts:
        needle = NIKKUD.sub("", str(excerpt)).strip(" .,?!;:\"'«»")
        if not needle:
            continue
        for i, phrase in enumerate(phrases):
            start = phrase.find(needle)
            if start >= 0:
                spans.append([i, start, start + len(needle)])
                break
    return spans


def rating(stars, justification) -> dict:
    stars = max(0, min(MAX_STARS, int(stars))) if isinstance(stars, (int, float)) else 0
    return {"stars": stars, "justification": str(justification or "").strip() if stars < MAX_STARS else ""}


class ComprehensionSession(TeacherSession):
    def __init__(self, browser: WebSocket, voice: str, lesson: str):
        text = get_dataset("text")[lesson]
        self.lesson = lesson
        self.title = text.get("title", "")
        self.phrases = [p["hebrew"] for p in text["phrases"]]
        # Jusqu'à QUESTIONS_PER_ROUND questions différentes du texte, tirées au hasard, posées dans l'ordre du texte.
        planned = list(dict.fromkeys(q["hebrew"] for q in text.get("questions") or []))
        drawn = set(random.sample(planned, min(QUESTIONS_PER_ROUND, len(planned))))
        self.questions = [q for q in planned if q in drawn]
        instructions = prompts.comprehension_instructions(self.phrases)
        super().__init__(browser, GeminiLive(voice, instructions, prompts.COMPREHENSION_START,
                                             [TEXT_TOOL, NEXT_QUESTION_TOOL, EVALUATION_TOOL]))
        self.text_shown = False
        self.highlighted: list[int] = []
        self.asked = 0  # questions déjà servies
        # Après une évaluation, la question suivante attend que l'élève appuie sur « Question suivante ».
        self.paused = False
        # Question servie au prof, affichée seulement quand il commence à la poser (cf. demande explicite du user).
        self.pending_question: dict | None = None
        self.question_served_at = 0.0

    async def on_started(self) -> None:
        log.info("Séance de compréhension lancée · voix %s · leçon %s · %d questions", self.live.voice, self.lesson,
                 len(self.questions))

    async def show_text(self) -> None:
        self.text_shown = True
        await self.to_browser({"type": "text", "lesson": self.lesson, "title": self.title, "phrases": self.phrases})

    async def tick(self, now: float) -> None:
        if not self.text_shown and now - self.started_at > TEXT_FALLBACK_SECONDS:
            log.info("pas de demande de texte : affichage spontané")
            await self.show_text()
            await self.live.note(prompts.TEXT_SHOWN)
        if self.pending_question and now - self.question_served_at > QUESTION_FALLBACK_SECONDS:
            log.info("le prof tarde à poser la question : affichage spontané")
            await self.show_question()

    async def on_hidden_turn_started(self) -> None:
        if self.pending_question:
            await self.show_question()

    async def show_question(self) -> None:
        question, self.pending_question = self.pending_question, None
        await self.to_browser({"type": "question", "question": question})

    async def on_tool_call(self, call: dict) -> None:
        if call["name"] == TEXT_TOOL["name"]:
            if not self.text_shown:
                await self.show_text()
            await self.live.tool_response(call["id"], call["name"], {"consigne": prompts.TEXT_DISPLAYED})
        elif call["name"] == NEXT_QUESTION_TOOL["name"]:
            if self.asked:
                # Seule la première question est demandée par le prof : les suivantes viennent de l'élève (« Question
                # suivante »), jamais du prof, qui enchaînerait sinon sans laisser relire l'évaluation.
                log.info("question demandée par le prof hors de propos : refusée")
                await self.live.tool_response(call["id"], call["name"], {"consigne": prompts.WAIT_FOR_NEXT})
                return
            await self.live.tool_response(call["id"], call["name"], {"question": self.serve_question()})
        elif call["name"] == EVALUATION_TOOL["name"]:
            await self.evaluate(call["args"])
            await self.live.tool_response(call["id"], call["name"], {"resultat": prompts.EVALUATION_SHOWN}, silent=True)
        else:
            await super().on_tool_call(call)

    async def on_browser_message(self, data: dict) -> None:
        if data.get("type") != "next" or not self.paused:
            return
        self.paused = False
        await self.to_browser({"type": "pause", "paused": False})
        await self.clear_exercise()
        if self.asked >= len(self.questions):
            await self.to_browser({"type": "phase", "phase": "done"})
            await self.live.app_message(prompts.NO_MORE_QUESTIONS)
            return
        await self.live.app_message(prompts.next_question_message(self.serve_question()))

    async def evaluate(self, args: dict) -> None:
        errors = [{"word": str(f.get("mot") or "").strip(), "comment": str(f.get("commentaire") or "").strip()}
                  for f in args.get("fautes") or [] if isinstance(f, dict)]
        await self.to_browser({"type": "evaluation", "evaluation": {
            "answer": str(args.get("reponse_eleve") or "").strip(),
            "errors": [e for e in errors if e["word"] or e["comment"]],
            "language": rating(args.get("note_langue"), args.get("justification_langue")),
            "comprehension": rating(args.get("note_comprehension"), args.get("justification_comprehension")),
        }})
        numbers = args.get("phrases_solution") or []
        excerpts = find_excerpts(self.phrases, args.get("extraits_solution") or [])
        # Les phrases sont numérotées à partir de 1 dans les instructions du prof ; celles des extraits trouvés sont
        # surlignées même s'il a oublié leur numéro.
        await self.highlight(sorted({int(n) - 1 for n in numbers
                                     if isinstance(n, (int, float)) and 1 <= n <= len(self.phrases)}
                                    | {span[0] for span in excerpts}), excerpts)
        self.paused = True
        await self.to_browser({"type": "pause", "paused": True})

    async def clear_exercise(self) -> None:
        """Plus de question, de réponse ni d'évaluation à l'écran, ni de solution surlignée."""
        await self.to_browser({"type": "question", "question": None})
        await self.to_browser({"type": "evaluation", "evaluation": None})
        if self.highlighted:
            await self.highlight([])

    def serve_question(self) -> str:
        """Question suivante, que le prof va poser : elle s'affichera dans la zone « Exercice » quand il commencera."""
        question = self.questions[self.asked]
        self.asked += 1
        log.info("question %d/%d : %s", self.asked, len(self.questions), question)
        # number ne s'affiche pas : il distingue seulement une question de la suivante à l'écran.
        self.pending_question = {"number": self.asked, "hebrew": question}
        self.question_served_at = time.monotonic()
        # La question ne s'affiche que dans la zone « Exercice », sans traduction (cf. demande explicite du user) :
        # le prof la prononce, mais sa prise de parole n'est ni traduite ni affichée dans la conversation. Ce qu'il
        # disait avant est clos, pour que la question parte bien dans une nouvelle prise de parole.
        self.end_turn()
        self.hidden_turn = True
        return question

    async def highlight(self, indices: list[int], excerpts: list[list[int]] | None = None) -> None:
        self.highlighted = indices
        await self.to_browser({"type": "highlight", "phrases": indices, "excerpts": excerpts or []})
