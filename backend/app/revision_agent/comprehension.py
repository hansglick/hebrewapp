"""Tâche « Compréhension de texte » : le prof (seul, sans autre modèle) fait afficher le texte de la leçon, puis pose
trois questions sur ce texte. Il ne les choisit pas, ni le moment de les poser : l'application les tire, les lui
donne et les affiche comme une consigne. Il évalue chaque réponse en silence, sur deux dimensions (langue et
compréhension : leurs fautes commentées, sans note, cf. demande explicite du user), sans la commenter ; l'élève relit l'évaluation et passe lui-même à la
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
  {"type": "evaluation", "evaluation": {"answer": str,
                                        "errors": [{"word": str, "kind": "language" | "truth", "comment": str}]}
                                        | null}
  {"type": "score", "score": {"comprehension": {"ok": int, "ko": int}},
   "event": {"kind": "comprehension", "ok": bool, "question": int, "seq": int} | null}  (suivi de la séance)
  {"type": "pause", "paused": bool}                     (évaluation affichée : question suivante en attente de l'élève)
  {"type": "phase", "phase": "done"}                    (toutes les questions ont été posées)
  {"type": "answering", "answering": bool}              (évaluation orale : phase de réponse ouverte ou close)
  {"type": "language", "language": "he" | "fr"}         (mode de langue du prof)
  {"type": "first_turn_done"}                           (le prof a fini sa première prise de parole)
Navigateur → backend : {"type": "next"} (question suivante), {"type": "retry"} (l'élève redonne sa réponse à la même
question : l'évaluation disparaît, le prof attend la nouvelle réponse et l'évalue), {"type": "language", "language":
"he" | "fr"} (l'élève change le mode de langue).

Avec l'évaluation orale, la séance devient une conversation menée par le prof (cf. demande explicite du user) : il
commente l'évaluation en français, puis décide avec l'élève de retenter (nouvel_essai) ou de passer à la question
suivante (question_suivante) ; les boutons restent un secours. L'application distingue la phase de réponse (ouverte
quand une question est posée ou que l'élève retente, close par l'évaluation) de la phase de conversation : hors de la
phase de réponse, ce que dit l'élève, même en hébreu, n'est jamais évalué (evaluer_reponse est refusée).
Avec ou sans évaluation orale, le prof parle uniquement la langue d'un mode tenu par l'application (hébreu au départ),
que l'élève change avec un bouton ou à la voix (changer_langue) ; seul l'énoncé des questions reste toujours en hébreu
(cf. demande explicite du user).
"""

import asyncio
import logging
import random
import re
import time

from fastapi import WebSocket

from app.data_loader import get_dataset
from app.revision_agent import prompts
from app.revision_agent.config import AUTO_RETRY, DEFAULT_LANGUAGE
from app.revision_agent.evaluation import (QUESTION_FALLBACK_SECONDS, align_error_words, french_texts,
                                           hebrew_answer)
from app.revision_agent.gemini_live import GeminiLive
from app.revision_agent.session import TeacherSession

log = logging.getLogger("revision_agent.comprehension")

TEXT_FALLBACK_SECONDS = 60  # si le prof n'a toujours pas fait afficher le texte
CLOSING_SECONDS = 1.2  # fermeture des fenêtres sous la question, de bas en haut (cf. .ra-volet-closing)
QUESTIONS_PER_ROUND = 3  # comme le prototype /dev/topic-prototype (cf. demande explicite du user)
NIKKUD = re.compile(r"[\u0591-\u05c7]")
# Les deux listes de fautes, remplies en deux temps (d'abord la langue, puis le texte) → type affiché, chacun dans sa
# couleur ; un même mot peut figurer dans les deux (cf. demande explicite du user).
ERROR_KINDS = {"fautes_langue": "language", "fautes_texte": "truth"}



def error_list(description: str, comment: str) -> dict:
    return {
        "type": "ARRAY",
        "description": description,
        "items": {
            "type": "OBJECT",
            "properties": {
                "mot": {"type": "STRING",
                        "description": "Le mot fautif, recopié exactement tel qu'il est écrit dans reponse_eleve"},
                "commentaire": {"type": "STRING",
                                "description": "En français (jamais en hébreu, sauf la forme correcte et les mots ou "
                                               "lettres hébreux cités, toujours en caractères hébreux, jamais en "
                                               f"lettres latines), en une phrase courte : {comment}"},
            },
            "required": ["mot", "commentaire"],
        },
    }


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

# Évaluation orale seulement : le prof rouvre lui-même la phase de réponse quand l'élève veut retenter.
RETRY_TOOL = {
    "name": "nouvel_essai",
    "description": "L'élève veut redonner sa réponse à la question en cours : efface l'évaluation affichée et rouvre "
                   "la phase de réponse.",
}

# L'élève demande à la voix de changer de langue.
LANGUAGE_TOOL = {
    "name": "changer_langue",
    "description": "L'élève demande à parler dans l'autre langue : change le mode de langue de la séance.",
    "parameters": {
        "type": "OBJECT",
        "properties": {"langue": {"type": "STRING", "enum": ["hebreu", "francais"],
                                  "description": "La langue demandée par l'élève"}},
        "required": ["langue"],
    },
}
LANGUAGES = {"hebreu": "he", "francais": "fr"}

EVALUATION_TOOL = {
    "name": "evaluer_reponse",
    "description": "Affiche à l'écran de l'élève l'évaluation de sa réponse : sa réponse, ses fautes commentées, "
                   "et surligne dans le texte la ou les phrases qui contiennent la solution.",
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "reponse_eleve": {
                "type": "STRING",
                "description": "La réponse de l'élève, toujours en écriture hébraïque (jamais en lettres latines), "
                               "exactement telle que tu l'as entendue, fautes comprises, sans la corriger "
                               "(vide s'il n'a rien répondu). Orthographe : écris chaque mot avec l'orthographe du "
                               "mot que l'élève a visiblement voulu dire (טסים pour le verbe לטוס, jamais l'homophone "
                               "תשים) ; garde les fautes de forme qu'il a vraiment prononcées, mais n'invente jamais "
                               "de faute d'orthographe, qui ne s'entend pas à l'oral.",
            },
            # Dans l'ordre où le prof les remplit : la langue d'abord, comme si la réponse était vraie, puis le texte.
            "fautes_langue": error_list(
                "Premier temps : chaque faute de langue de la réponse, dans l'ordre, en la jugeant comme si elle était "
                "vraie ([] s'il n'y en a pas)",
                "la nature de la faute et la forme correcte"),
            "fautes_texte": error_list(
                "Second temps : chaque mot de la réponse qui dit une chose fausse d'après le texte, dans l'ordre, "
                "même s'il figure déjà dans fautes_langue ([] s'il n'y en a pas)",
                "réfute seulement ce que la réponse affirme à tort, sans jamais dire ce que dit le texte à la "
                "place, ni en hébreu ni en français (« le texte ne dit pas que Roni lit la Torah », jamais « le texte "
                "dit que Roni lit un journal, pas la Torah »)"),
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
        "required": ["reponse_eleve", "fautes_langue", "fautes_texte", "phrases_solution", "extraits_solution"],
    },
    "behavior": "NON_BLOCKING",
}


# Nouvel essai d'office (AUTO_RETRY) : le prof dit d'abord si la phrase de l'élève répond à la question affichée.
ANSWERS_QUESTION = {
    "type": "STRING",
    "enum": ["oui", "non", "incertain"],
    "description": "À remplir en premier : la phrase hébraïque de l'élève répond-elle à la question affichée (sa "
                   "réponse, ou un nouvel essai, même entouré de français) ? non : une question au prof, une variante "
                   "qui change les faits, un exemple. Dans le doute, oui ; incertain seulement si c'est vraiment "
                   "impossible à dire.",
}


def evaluation_tool(auto_retry: bool) -> dict:
    if not auto_retry:
        return EVALUATION_TOOL
    parameters = EVALUATION_TOOL["parameters"]
    return {**EVALUATION_TOOL, "parameters": {
        **parameters,
        "properties": {"reponse_a_la_question": ANSWERS_QUESTION, **parameters["properties"]},
        "required": ["reponse_a_la_question", *parameters["required"]],
    }}


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


class ComprehensionSession(TeacherSession):
    def __init__(self, browser: WebSocket, voice: str, lesson: str, oral: bool = True):
        text = get_dataset("text")[lesson]
        self.lesson = lesson
        self.title = text.get("title", "")
        self.phrases = [p["hebrew"] for p in text["phrases"]]
        # Jusqu'à QUESTIONS_PER_ROUND questions différentes du texte, tirées au hasard, posées dans l'ordre du texte.
        planned = list(dict.fromkeys(q["hebrew"] for q in text.get("questions") or []))
        drawn = set(random.sample(planned, min(QUESTIONS_PER_ROUND, len(planned))))
        self.questions = [q for q in planned if q in drawn]
        self.oral = oral  # le prof commente l'évaluation à voix haute, en français
        # Nouvel essai d'office pendant la conversation (cf. AUTO_RETRY).
        self.auto_retry = oral and AUTO_RETRY
        instructions = prompts.comprehension_instructions(self.phrases, oral, self.auto_retry)
        tools = ([TEXT_TOOL, NEXT_QUESTION_TOOL, evaluation_tool(self.auto_retry), LANGUAGE_TOOL]
                 + ([RETRY_TOOL] if oral else []))
        start = f"{prompts.COMPREHENSION_START} {prompts.language_mode(DEFAULT_LANGUAGE)}"
        super().__init__(browser, GeminiLive(voice, instructions, start, tools))
        self.text_shown = False
        self.highlighted: list[int] = []
        self.asked = 0  # questions déjà servies
        # Après une évaluation, la question suivante attend que l'élève appuie sur « Question suivante ».
        self.paused = False
        # Question servie au prof, affichée seulement quand il commence à la poser (cf. demande explicite du user).
        self.pending_question: dict | None = None
        self.question_served_at = 0.0
        self.heard = ""  # transcription de ce que l'élève a dit depuis la dernière question
        # Phase de réponse : une question est posée (ou l'élève retente) et n'a pas encore été évaluée. En évaluation
        # orale, hors de cette phase, ce que dit l'élève est de la conversation et n'est jamais évalué.
        self.answering = False
        self.language = DEFAULT_LANGUAGE  # mode de langue du prof (cf. config)
        self.first_turn_done = False  # la bulle du mode de langue attend la fin de sa première prise de parole
        # Les fenêtres de la question se ferment (cf. close_exercise) : la question suivante attend la fin.
        self.closing = False
        self.question_due = False
        # Suivi de la séance (cf. expression.py) : réponses justes et fausses.
        self.score = {"comprehension": {"ok": 0, "ko": 0}}
        self.score_events = 0

    async def on_started(self) -> None:
        log.info("Séance de compréhension lancée · voix %s · leçon %s · %d questions", self.live.voice, self.lesson,
                 len(self.questions))
        await self.to_browser({"type": "language", "language": self.language})
        await self.to_browser({"type": "score", "score": self.score, "event": None})

    async def record(self, ok: bool) -> None:
        self.score["comprehension"]["ok" if ok else "ko"] += 1
        self.score_events += 1
        await self.to_browser({"type": "score", "score": self.score, "event": {
            "kind": "comprehension", "ok": ok, "question": self.asked, "seq": self.score_events}})

    async def show_text(self) -> None:
        self.text_shown = True
        await self.to_browser({"type": "text", "lesson": self.lesson, "title": self.title, "phrases": self.phrases})

    async def tick(self, now: float) -> None:
        # Fin de la première prise de parole du prof, une fois sa voix entièrement jouée chez l'élève.
        if (not self.first_turn_done and self.turn.segments and not self.turn.open
                and 0 < self.playback_until <= now):
            self.first_turn_done = True
            await self.to_browser({"type": "first_turn_done"})
        if not self.text_shown and now - self.started_at > TEXT_FALLBACK_SECONDS:
            log.info("pas de demande de texte : affichage spontané")
            await self.show_text()
            await self.live.note(self.in_mode(prompts.TEXT_SHOWN))
        if (self.pending_question and not self.closing
                and now - self.question_served_at > QUESTION_FALLBACK_SECONDS):
            log.info("le prof tarde à poser la question : affichage spontané")
            await self.show_question()

    async def on_hidden_turn_started(self) -> None:
        # La question s'affiche quand le prof commence à la poser, une fois les fenêtres précédentes fermées.
        if self.closing:
            self.question_due = True
        elif self.pending_question:
            await self.show_question()

    async def show_question(self) -> None:
        question, self.pending_question = self.pending_question, None
        await self.to_browser({"type": "question", "question": question})

    async def on_tool_call(self, call: dict) -> None:
        if call["name"] == TEXT_TOOL["name"]:
            if not self.text_shown:
                await self.show_text()
            await self.live.tool_response(call["id"], call["name"], {"consigne": self.in_mode(prompts.TEXT_DISPLAYED)})
        elif call["name"] == NEXT_QUESTION_TOOL["name"] and self.oral and self.asked:
            # Évaluation orale : c'est le prof qui passe à la suite, une fois la réponse évaluée.
            if self.answering:
                log.info("question suivante demandée avant l'évaluation : refusée")
                await self.live.tool_response(call["id"], call["name"], {"consigne": prompts.STILL_ANSWERING})
                return
            await self.leave_question()
            await self.close_exercise()
            if self.asked >= len(self.questions):
                await self.to_browser({"type": "phase", "phase": "done"})
                await self.live.tool_response(call["id"], call["name"],
                                              {"consigne": self.in_mode(prompts.NO_MORE_QUESTIONS_ORAL)})
                return
            await self.live.tool_response(call["id"], call["name"], {"question": self.serve_question()})
            await self.set_answering(True)
        elif call["name"] == LANGUAGE_TOOL["name"]:
            language = LANGUAGES.get((call.get("args") or {}).get("langue"), self.language)
            await self.set_language(language)
            await self.live.tool_response(call["id"], call["name"], {"consigne": prompts.language_mode(language)})
        elif call["name"] == RETRY_TOOL["name"]:
            if self.answering:
                await self.live.tool_response(call["id"], call["name"], {"consigne": prompts.STILL_ANSWERING})
                return
            await self.leave_question()
            await self.reopen_answer()
            await self.live.tool_response(call["id"], call["name"], {"consigne": self.in_mode(prompts.RETRY_OPENED)})
        elif call["name"] == NEXT_QUESTION_TOOL["name"]:
            if self.asked:
                # Seule la première question est demandée par le prof : les suivantes viennent de l'élève (« Question
                # suivante »), jamais du prof, qui enchaînerait sinon sans laisser relire l'évaluation.
                log.info("question demandée par le prof hors de propos : refusée")
                await self.live.tool_response(call["id"], call["name"], {"consigne": self.in_mode(prompts.WAIT_FOR_NEXT)})
                return
            await self.live.tool_response(call["id"], call["name"], {"question": self.serve_question()})
            await self.set_answering(True)
        elif call["name"] == EVALUATION_TOOL["name"]:
            if self.oral and not self.answering:
                # Pendant la conversation, une phrase hébraïque n'est une réponse que si elle répond à la question
                # affichée, d'après le prof (nouvel essai d'office) ; sinon, c'est une réplique.
                verdict = (call.get("args") or {}).get("reponse_a_la_question") if self.auto_retry else None
                log.info("évaluation pendant la conversation : %s", verdict or "refusée")
                if verdict == "incertain":
                    await self.live.tool_response(call["id"], call["name"],
                                                  {"resultat": self.in_mode(prompts.ASK_IF_ANSWER)})
                    return
                if verdict != "oui":
                    await self.live.tool_response(call["id"], call["name"],
                                                  {"resultat": self.in_mode(prompts.NOT_ANSWERING)})
                    return
            succeeded = await self.evaluate(call["args"])
            await self.set_answering(False)
            # Évaluation orale : le prof ne la commente qu'une fois affichée (evaluate l'a envoyée avant de répondre),
            # dès qu'il a fini de parler ; réponse juste, il enchaîne sur la question suivante.
            if self.oral:
                shown = prompts.PERFECT_ANSWER_COMPREHENSION if succeeded else prompts.EVALUATION_SHOWN_CONVERSATION
                await self.live.tool_response(call["id"], call["name"], {"resultat": self.in_mode(shown)},
                                              when_idle=True)
            else:
                await self.live.tool_response(call["id"], call["name"], {"resultat": prompts.EVALUATION_SHOWN},
                                              silent=True)
        else:
            await super().on_tool_call(call)

    async def on_browser_message(self, data: dict) -> None:
        if data.get("type") == "language" and data.get("language") in prompts.LANGUAGE_NAMES:
            if data["language"] != self.language:
                await self.set_language(data["language"])
                # S'il parlait, le prof est coupé et reprend dans la nouvelle langue ; sinon, il le saura pour la suite.
                speaking = await self.cut_teacher()
                await (self.live.app_message if speaking else self.live.note)(prompts.language_switched(self.language))
            return
        if data.get("type") not in ("next", "retry") or not self.paused:
            return
        await self.leave_question()
        # S'il commente encore l'évaluation, le prof est coupé : l'élève passe à la suite.
        speaking = await self.cut_teacher()
        if data["type"] == "retry":
            # Même question, nouvelle réponse (cf. demande explicite du user) : seule l'évaluation disparaît.
            await self.reopen_answer()
            # Un message qui demande une réponse interrompt le prof ; sinon, une simple note suffit.
            await (self.live.app_message if speaking else self.live.note)(prompts.RETRY_ANSWER)
            return
        await self.close_exercise()
        if self.asked >= len(self.questions):
            await self.to_browser({"type": "phase", "phase": "done"})
            await self.live.app_message(self.in_mode(prompts.NO_MORE_QUESTIONS_ORAL if self.oral
                                                     else prompts.NO_MORE_QUESTIONS))
            return
        await self.live.app_message(prompts.next_question_message(self.serve_question()))
        await self.set_answering(True)

    async def leave_question(self) -> None:
        """L'élève quitte l'évaluation affichée (nouvel essai ou question suivante) : plus de pause."""
        self.paused = False
        await self.to_browser({"type": "pause", "paused": False})

    async def reopen_answer(self) -> None:
        """Nouvel essai sur la même question : l'évaluation disparaît et la phase de réponse se rouvre."""
        await self.to_browser({"type": "evaluation", "evaluation": None})
        if self.highlighted:
            await self.highlight([])
        self.heard = ""
        await self.set_answering(True)

    async def set_language(self, language: str) -> None:
        log.info("mode de langue : %s", language)
        self.language = language
        await self.to_browser({"type": "language", "language": language})

    def in_mode(self, message: str) -> str:
        """Message de l'application au prof, avec le rappel du mode de langue en cours."""
        return f"{message} {prompts.language_mode(self.language)}"

    async def set_answering(self, answering: bool) -> None:
        self.answering = answering
        if self.oral:
            await self.to_browser({"type": "answering", "answering": answering})

    async def on_user_text(self, text: str) -> None:
        # Ce que l'élève dit depuis la question (transcription automatique, en hébreu) : sa réponse, si le prof
        # la rapporte en lettres latines.
        self.heard += text

    async def evaluate(self, args: dict) -> bool:
        """Affiche l'évaluation ; vrai si la réponse est juste (aucune faute)."""
        errors = [{"word": str(f.get("mot") or "").strip(), "kind": kind, "comment": str(f.get("commentaire") or "").strip()}
                  for field, kind in ERROR_KINDS.items() for f in args.get(field) or [] if isinstance(f, dict)]
        errors = [e for e in errors if e["word"] or e["comment"]]
        # Chaque mot fautif écrit comme dans son commentaire (homophones, cf. evaluation.align_error_words).
        answer = align_error_words(hebrew_answer(args.get("reponse_eleve"), self.heard), errors)
        # Les commentaires s'adressent à un francophone : toujours en français, l'hébreu qu'ils citent en caractères
        # hébreux (cf. evaluation.french_texts).
        for error, comment in zip(errors, await french_texts([e["comment"] for e in errors])):
            error["comment"] = comment
        await self.to_browser({"type": "evaluation", "evaluation": {"answer": answer, "errors": errors}})
        numbers = args.get("phrases_solution") or []
        excerpts = find_excerpts(self.phrases, args.get("extraits_solution") or [])
        # Les phrases sont numérotées à partir de 1 dans les instructions du prof ; celles des extraits trouvés sont
        # surlignées même s'il a oublié leur numéro.
        await self.highlight(sorted({int(n) - 1 for n in numbers
                                     if isinstance(n, (int, float)) and 1 <= n <= len(self.phrases)}
                                    | {span[0] for span in excerpts}), excerpts)
        self.paused = True
        await self.to_browser({"type": "pause", "paused": True})
        await self.record(not errors)
        return not errors

    async def close_exercise(self) -> None:
        """Les fenêtres sous la question se ferment de bas en haut, puis l'exercice s'efface (cf. demande explicite du
        user) ; la question suivante s'affiche ensuite."""
        await self.to_browser({"type": "closing"})
        self.closing, self.question_due = True, False

        async def clear() -> None:
            await asyncio.sleep(CLOSING_SECONDS)
            await self.clear_exercise()
            self.closing = False
            if self.question_due and self.pending_question:
                await self.show_question()

        self.background.append(asyncio.create_task(clear()))

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
        self.heard = ""
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
