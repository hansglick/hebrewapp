"""Tâche « Expression libre » : le prof (seul, sans autre modèle) pose trois questions de mise en situation qui
amènent l'élève à construire une phrase avec le vocabulaire des leçons révisées. Comme en compréhension de texte (cf.
demande explicite du user), mais sans texte : il évalue chaque réponse en silence, sur la langue seulement (de 0 à 5
étoiles, justifiées), jamais sur sa véracité, sans la commenter ; l'élève relit l'évaluation et passe lui-même à la
question suivante.

Le prof invente ses questions, mais pas le moment de les poser : il soumet chacune à l'application (poser_question)
avant de la prononcer, ce qu'elle ne lui permet qu'au début de la séance puis quand l'élève appuie sur « Question
suivante ». La question s'affiche alors comme une consigne, avec son indice, et non dans la conversation.

Messages propres à la tâche (backend → navigateur, en plus de ceux de session.py) :
  {"type": "question", "question": {"number": int, "hebrew": str, "hint": [str]} | null}
        (sans traduction, quand le prof commence à la poser ; hint : mots du vocabulaire autorisé, en hébreu)
  {"type": "evaluation", "evaluation": {"answer": str, "errors": [{"word": str, "kind": "language", "comment": str}],
                                        "language": {"stars": int, "justification": str},
                                        "solution": str} | null}
  {"type": "pause", "paused": bool}                     (évaluation affichée : question suivante en attente de l'élève)
  {"type": "phase", "phase": "done"}                    (toutes les questions ont été posées)
Navigateur → backend : {"type": "next"} (question suivante).
"""

import logging
import time

from fastapi import WebSocket

from app.revision_agent import prompts
from app.revision_agent.evaluation import (HEBREW_LETTER, JUSTIFICATION, QUESTION_FALLBACK_SECONDS, STARS, french,
                                           hebrew_answer, rating)
from app.revision_agent.gemini_live import GeminiLive
from app.revision_agent.session import TeacherSession

log = logging.getLogger("revision_agent.expression")

QUESTIONS_PER_ROUND = 3  # comme la compréhension de texte

QUESTION_TOOL = {
    "name": "poser_question",
    "description": "Soumet à l'application la question que tu vas poser, qu'elle affiche à l'écran de l'élève avec "
                   "son indice ; te dit si tu peux la poser maintenant.",
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "question": {"type": "STRING",
                         "description": "La question, en hébreu, exactement telle que tu vas la prononcer"},
            "mots": {"type": "ARRAY", "items": {"type": "INTEGER"},
                     "description": "Numéros de 1 à 3 mots de la liste « Vocabulaire autorisé » de tes instructions, "
                                    "qui correspondent à l'action d'une réponse plausible (l'indice)"},
        },
        "required": ["question", "mots"],
    },
    # Bloquante : le prof attend le feu vert avant de la poser.
}

EVALUATION_TOOL = {
    "name": "evaluer_reponse",
    "description": "Affiche à l'écran de l'élève l'évaluation de sa réponse : sa réponse, ses fautes commentées, "
                   "sa note de langue justifiée et une phrase correcte.",
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "reponse_eleve": {
                "type": "STRING",
                "description": "La réponse de l'élève, toujours en écriture hébraïque (jamais en lettres latines), "
                               "exactement telle que tu l'as entendue, fautes comprises, sans la corriger "
                               "(vide s'il n'a rien répondu)",
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
                                        "description": "En français (jamais en hébreu, sauf la forme correcte), en une "
                                                       "phrase courte : la nature de la faute et la forme correcte"},
                    },
                    "required": ["mot", "commentaire"],
                },
            },
            "note_langue": STARS,
            "justification_langue": JUSTIFICATION,
            "solution": {
                "type": "STRING",
                "description": "En hébreu : la réponse de l'élève corrigée si elle contient des fautes, sinon une autre "
                               "façon correcte de répondre",
            },
        },
        "required": ["reponse_eleve", "fautes", "note_langue", "justification_langue", "solution"],
    },
    "behavior": "NON_BLOCKING",
}


class ExpressionSession(TeacherSession):
    def __init__(self, browser: WebSocket, voice: str, lesson: str, vocabulary: list[dict]):
        self.lesson = lesson
        self.vocabulary = vocabulary
        instructions = prompts.expression_instructions(vocabulary)
        super().__init__(browser, GeminiLive(voice, instructions, prompts.EXPRESSION_START,
                                             [QUESTION_TOOL, EVALUATION_TOOL]))
        self.asked = 0  # questions déjà posées
        # Le prof ne peut poser une question qu'au début, puis quand l'élève appuie sur « Question suivante ».
        self.may_ask = True
        # Après une évaluation, la question suivante attend que l'élève appuie sur « Question suivante ».
        self.paused = False
        # Question soumise par le prof, affichée seulement quand il commence à la poser (cf. demande explicite du user).
        self.pending_question: dict | None = None
        self.question_served_at = 0.0
        self.heard = ""  # transcription de ce que l'élève a dit depuis la dernière question
        self.answering = False  # une question attend son évaluation

    async def on_started(self) -> None:
        log.info("Séance d'expression libre lancée · voix %s · leçon %s · %d mots", self.live.voice, self.lesson,
                 len(self.vocabulary))

    async def tick(self, now: float) -> None:
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
        if call["name"] == QUESTION_TOOL["name"]:
            question = str(call["args"].get("question") or "").strip()
            if not self.may_ask:
                # Le prof n'enchaîne jamais de lui-même : la question suivante vient de l'élève (« Question suivante »).
                log.info("question soumise hors de propos : refusée (%s)", question)
                await self.live.tool_response(call["id"], call["name"], {"consigne": prompts.WAIT_FOR_NEXT})
                return
            if not HEBREW_LETTER.search(question):
                await self.live.tool_response(call["id"], call["name"], {"consigne": prompts.QUESTION_IN_HEBREW})
                return
            self.serve_question(question, call["args"].get("mots"))
            await self.live.tool_response(call["id"], call["name"], {"consigne": prompts.ASK_QUESTION})
        elif call["name"] == EVALUATION_TOOL["name"]:
            if self.answering:
                await self.evaluate(call["args"])
            else:
                log.info("évaluation sans question en cours : ignorée")
            await self.live.tool_response(call["id"], call["name"], {"resultat": prompts.EVALUATION_SHOWN}, silent=True)
        else:
            await super().on_tool_call(call)

    async def on_browser_message(self, data: dict) -> None:
        if data.get("type") != "next" or not self.paused:
            return
        self.paused = False
        await self.to_browser({"type": "pause", "paused": False})
        await self.clear_exercise()
        if self.asked >= QUESTIONS_PER_ROUND:
            await self.to_browser({"type": "phase", "phase": "done"})
            await self.live.app_message(prompts.NO_MORE_QUESTIONS)
            return
        self.may_ask = True
        await self.live.app_message(prompts.ASK_NEXT_QUESTION)

    async def on_user_text(self, text: str) -> None:
        # Ce que l'élève dit depuis la question (transcription automatique, en hébreu) : sa réponse, si le prof
        # la rapporte en lettres latines.
        self.heard += text

    async def evaluate(self, args: dict) -> None:
        errors = [{"word": str(f.get("mot") or "").strip(), "kind": "language",
                   "comment": str(f.get("commentaire") or "").strip()}
                  for f in args.get("fautes") or [] if isinstance(f, dict)]
        errors = [e for e in errors if e["word"] or e["comment"]]
        language = rating(args.get("note_langue"), args.get("justification_langue"))
        # Commentaires et justification s'adressent à un francophone : toujours en français.
        for item, key in [(e, "comment") for e in errors] + [(language, "justification")]:
            item[key] = await french(item[key])
        await self.to_browser({"type": "evaluation", "evaluation": {
            "answer": hebrew_answer(args.get("reponse_eleve"), self.heard), "errors": errors, "language": language,
            "solution": str(args.get("solution") or "").strip(),
        }})
        self.answering = False
        self.paused = True
        await self.to_browser({"type": "pause", "paused": True})

    async def clear_exercise(self) -> None:
        """Plus de question, de réponse ni d'évaluation à l'écran."""
        await self.to_browser({"type": "question", "question": None})
        await self.to_browser({"type": "evaluation", "evaluation": None})

    def serve_question(self, question: str, numbers) -> None:
        """Question que le prof va poser : elle s'affichera dans la zone « Exercice » quand il commencera."""
        self.asked += 1
        self.may_ask = False
        self.answering = True
        # Seuls les mots de la liste peuvent s'afficher dans l'indice (cf. demande explicite du user : il doit
        # appartenir au vocabulaire des leçons révisées) ; les numéros sont comptés à partir de 1.
        numbers = [int(n) for n in numbers or [] if isinstance(n, (int, float))]
        hint = list(dict.fromkeys(self.vocabulary[n - 1]["hebrew"] for n in numbers if 1 <= n <= len(self.vocabulary)))
        log.info("question %d/%d : %s · indice %s", self.asked, QUESTIONS_PER_ROUND, question, hint)
        # number ne s'affiche pas : il distingue seulement une question de la suivante à l'écran.
        self.pending_question = {"number": self.asked, "hebrew": question, "hint": hint[:3]}
        self.heard = ""
        self.question_served_at = time.monotonic()
        # La question ne s'affiche que dans la zone « Exercice », sans traduction : le prof la prononce, mais sa prise
        # de parole n'est ni traduite ni affichée dans la conversation. Ce qu'il disait avant est clos, pour que la
        # question parte bien dans une nouvelle prise de parole.
        self.end_turn()
        self.hidden_turn = True
