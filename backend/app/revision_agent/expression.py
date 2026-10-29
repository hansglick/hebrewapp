"""Tâche « Expression libre » : le prof pose trois questions naturelles, tirées par l'application dans les sujets
d'expression du niveau choisi (cf. revision_topics.json), auxquelles l'élève répond par une phrase complète en
hébreu (cf. demande explicite du user). C'est une conversation menée par le prof, comme la compréhension avec
évaluation orale, dans le mode de langue tenu par l'application.

Pour chaque question :
- indices : quand l'élève bloque, ou après une réponse fausse, le prof lui en propose un ; s'il accepte, l'application
  dévoile le suivant (verbe, mot, règle, sens de la réponse, début de la réponse…), affiché et dit par le prof ;
- évaluation : les fautes de langue et de sens (pas la vérité), chacune commentée sans donner la solution ; pas de
  note (cf. demande explicite du user) : la réponse est réussie si elle n'a aucune faute ;
- réponse parfaite : l'élève décline sa phrase (un seul élément, cf. sentence_declension.py), évaluée sur la langue
  seule ; réussie, ou s'il passe, les fenêtres se ferment de bas en haut et la question suivante arrive.
Le tirage couvre d'abord les concepts accessibles au niveau, sinon les conjugaisons, puis le ל décliné ; à droite
s'affichent le programme de la séance (libellés courts) et, une fois la question posée, son sujet avec sa description
détaillée (cf. expression_topic_texts.json, rédigée pour le seul concept retenu).

Messages propres à la tâche (backend → navigateur, en plus de ceux de session.py) :
  {"type": "topics", "topics": [{"short", "label", "rule", "details": str, "course": {…} | null}], "current": int,
   "covered": [int]}   (programme de la séance, chaque sujet une fois ; celui de la question en cours, ceux déjà vus)
  {"type": "question", "question": {"number": int, "hebrew": str} | null}
  {"type": "hints", "hints": [{"label": str, "hebrew": str, "french": str}]}   (indices déjà donnés)
  {"type": "evaluation", "evaluation": {"answer": str,
                                        "errors": [{"word": str, "kind": "language" | "sense", "comment": str}]}
                                        | null}
  {"type": "declension", "declension": {"sentence": str, "span": [int, int], "replacement": str, "kind": str,
                                        ["expected", "source", "target"]} | null}   (cf. SHOW_DECLENSION_EXPECTED)
  {"type": "declension_evaluation", "evaluation": {"answer", "errors"} | null}
  {"type": "closing"}                                   (les fenêtres de la question se ferment, de bas en haut)
  {"type": "score", "score": {"expression" | "declension": {"ok": int, "ko": int}},
   "event": {"kind": "expression" | "declension", "ok": bool, "question": int, "seq": int} | null}
                                                        (bilan de la séance ; event : l'essai qui vient d'être évalué)
  {"type": "answering", "answering": bool}, {"type": "language", ...}, {"type": "first_turn_done"},
  {"type": "phase", "phase": "done"}                    (comme en compréhension)
Navigateur → backend : {"type": "next"}, {"type": "retry"}, {"type": "language", "language": "he" | "fr"}.
"""

import asyncio
import json
import logging
import random
import time

from fastapi import WebSocket

from app.config import DATA_DIR

from app.revision_agent import prompts, sentence_declension
from app.revision_agent.comprehension import LANGUAGE_TOOL, LANGUAGES
from app.revision_agent.config import DEFAULT_LANGUAGE, SHOW_DECLENSION_EXPECTED
from app.revision_agent.evaluation import (QUESTION_FALLBACK_SECONDS, align_error_words, french_texts,
                                           hebrew_answer)
from app.revision_agent.gemini_live import GeminiLive
from app.revision_agent.passages import lesson_number
from app.revision_agent.session import TeacherSession
from app.revision_agent.topics import topics_for

log = logging.getLogger("revision_agent.expression")

QUESTIONS_PER_ROUND = 3  # pour découvrir la tâche, comme la compréhension (cf. demande explicite du user)
CLOSING_SECONDS = 1.2  # fermeture des fenêtres de la question, de bas en haut (cf. .ra-closing)
TEACHER_IDLE_TIMEOUT = 10  # la déclinaison attend au plus ce délai que le prof ait fini de féliciter l'élève
# Ordre de priorité des sujets au tirage : les concepts, sinon les conjugaisons, puis le ל décliné.
TOPIC_GROUPS = ("expression:concept:", "expression:conjugaison:", "expression:preposition:")
# Sujets dont la déclinaison porte de préférence sur une préposition déclinée (possession, ressenti, ל décliné).
PREPOSITION_TOPICS = ("expression:concept:0.08", "expression:concept:0.18", "expression:preposition:")

NEXT_QUESTION_TOOL = {
    "name": "question_suivante",
    "description": "Passe à la question suivante : ferme les fenêtres de la question en cours, affiche la nouvelle à "
                   "l'écran de l'élève et te la renvoie, avec une réponse possible (repère, à ne jamais dire).",
    # Bloquante : le prof attend la question avant de la poser.
}

HINT_TOOL = {
    "name": "donner_indice",
    "description": "L'élève a accepté un indice : affiche le suivant à son écran et te le renvoie.",
}

RETRY_TOOL = {
    "name": "nouvel_essai",
    "description": "L'élève veut redonner sa réponse (à la question, ou à la déclinaison en cours) : efface "
                   "l'évaluation affichée.",
}

# Nouvel essai d'office : le prof dit d'abord si la phrase de l'élève est un essai de l'exercice affiché.
RETRY_VERDICT = {
    "type": "STRING",
    "enum": ["oui", "non", "incertain"],
    "description": "À remplir en premier : la phrase hébraïque de l'élève est-elle un essai de l'exercice affiché (sa "
                   "réponse, ou un nouvel essai, même entouré de français) ? non : une question au prof, un exemple. "
                   "Dans le doute, oui ; incertain seulement si c'est vraiment impossible à dire.",
}
ANSWER = {
    "type": "STRING",
    "description": "La réponse de l'élève, toujours en écriture hébraïque (jamais en lettres latines), exactement "
                   "telle que tu l'as entendue, fautes comprises, sans la corriger (vide s'il n'a rien répondu). "
                   "Orthographe : écris chaque mot avec l'orthographe du mot que l'élève a visiblement voulu dire "
                   "(טסים pour le verbe לטוס, jamais l'homophone תשים) ; garde les fautes de forme qu'il a vraiment "
                   "prononcées, mais n'invente jamais de faute d'orthographe, qui ne s'entend pas à l'oral.",
}

def error_list(description: str) -> dict:
    """Fautes relevées : le mot fautif (surligné à l'écran) et l'origine de l'erreur, sans jamais la solution (cf.
    demande explicite du user)."""
    return {
        "type": "ARRAY",
        "description": description,
        "items": {
            "type": "OBJECT",
            "properties": {
                "mot": {"type": "STRING",
                        "description": "Le mot fautif, recopié exactement tel qu'il est écrit dans reponse_eleve"},
                "commentaire": {"type": "STRING",
                                "description": "En français, en quelques mots, factuellement : l'origine de l'erreur "
                                               "(« ce n'est pas le pronom demandé », « mauvaise conjugaison », « il "
                                               "manque la préposition »). Ne donne JAMAIS la forme correcte ni la "
                                               "solution, ni en hébreu ni en français"},
            },
            "required": ["mot", "commentaire"],
        },
    }


EVALUATION_TOOL = {
    "name": "evaluer_reponse",
    "description": "Affiche à l'écran de l'élève l'évaluation de sa réponse à la question : sa réponse, ses fautes "
                   "surlignées et commentées (langue, sens).",
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "nouvel_essai": RETRY_VERDICT,
            "reponse_eleve": ANSWER,
            "fautes_langue": error_list("Chaque faute de langue de la réponse, dans l'ordre ([] s'il n'y en a pas)"),
            "fautes_sens": error_list("Chaque mot qui rend la phrase incohérente ou hors de propos par rapport à la "
                                      "question ([] s'il n'y en a pas)"),
        },
        "required": ["nouvel_essai", "reponse_eleve", "fautes_langue", "fautes_sens"],
    },
    "behavior": "NON_BLOCKING",
}

DECLENSION_EVALUATION_TOOL = {
    "name": "evaluer_declinaison",
    "description": "Affiche à l'écran de l'élève l'évaluation de sa phrase déclinée : sa phrase, ses fautes "
                   "surlignées et commentées.",
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "nouvel_essai": RETRY_VERDICT,
            "reponse_eleve": ANSWER,
            "fautes_langue": error_list(
                "Chaque faute de la phrase déclinée, dans l'ordre : remplacement non fait ou erroné, accord oublié, "
                "toute autre faute de langue ([] s'il n'y en a pas)"),
        },
        "required": ["nouvel_essai", "reponse_eleve", "fautes_langue"],
    },
    "behavior": "NON_BLOCKING",
}


def hint_ladder(exercise: dict) -> list[dict]:
    """Indices de l'exercice, du plus léger au plus fort, seulement ceux qui existent (cf. demande explicite du user)."""
    hints = []
    for key, label in (("verb", "Verbe"), ("word", "Mot")):
        if exercise.get(key):
            hints.append({"label": label, "hebrew": exercise[key]["hebrew"], "french": exercise[key]["french"]})
    if exercise.get("concept_tip"):
        hints.append({"label": "Règle", "hebrew": "", "french": exercise["concept_tip"]})
    if exercise.get("translation_tip"):
        hints.append({"label": "Sens de la réponse", "hebrew": "", "french": exercise["translation_tip"]})
    for key in ("truncated_one", "truncated_two"):
        start = (exercise.get(key) or "").strip()
        if start and all(start != h["hebrew"].rstrip("…") for h in hints):
            hints.append({"label": "Début de la réponse", "hebrew": f"{start}…", "french": ""})
    return hints


def draw_questions(lesson: str, count: int = QUESTIONS_PER_ROUND) -> list[dict]:
    """count questions de sujets différents (sinon au plus deux par sujet) : les concepts accessibles d'abord, sinon les conjugaisons, puis le ל
    décliné ; dans chaque groupe, le sujet le plus récent passe en tête une fois sur deux, et chaque question est
    tirée une fois sur deux parmi celles de la leçon la plus récente du sujet. Jamais deux fois la même réponse."""
    topics = topics_for("expression", lesson)
    ordered = []
    for prefix in TOPIC_GROUPS:
        group = [t for t in topics if t["id"].startswith(prefix)]
        random.shuffle(group)
        if group and random.random() < 0.5:
            recent = max(group, key=lambda t: lesson_number(t["introduced_in"]))
            group.remove(recent)
            group.insert(0, recent)
        ordered += group
    drawn, answers = [], set()
    # Un second passage seulement s'il y a moins de sujets que de questions : au plus deux questions par sujet.
    with open(DATA_DIR / "expression_topic_texts.json", encoding="utf-8") as f:
        texts = json.load(f)
    for topic in ordered * 2:
        exercises = [e for e in topic["exercises"] if e["text"] not in answers]
        if not exercises:
            continue
        latest = max(lesson_number(e["lesson"]) for e in exercises)
        recent = [e for e in exercises if lesson_number(e["lesson"]) == latest]
        exercise = random.choice(recent if random.random() < 0.5 else exercises)
        answers.add(exercise["text"])
        drawn.append({
            "topic": {"id": topic["id"], "label": topic["label"], "rule": topic["rule"],
                      # Libellé court du programme et description détaillée (« Détails ») ; à défaut, ceux du catalogue.
                      "short": texts.get(topic["id"], {}).get("short", topic["label"]),
                      "details": texts.get(topic["id"], {}).get("details", topic["rule"]),
                      # Le même cours mis en forme (cf. scripts/format_topic_texts.py), s'il existe.
                      "course": texts.get(topic["id"], {}).get("course")},
            "hebrew": exercise["question"]["hebrew"], "french": exercise["question"]["french"],
            "answer": exercise["text"], "hints": hint_ladder(exercise),
            "preferred": "preposition" if topic["id"].startswith(PREPOSITION_TOPICS) else "subject",
        })
        if len(drawn) == count:
            break
    return drawn


def perfect(evaluation: dict) -> bool:
    return not evaluation["errors"]


class ExpressionSession(TeacherSession):
    def __init__(self, browser: WebSocket, voice: str, lesson: str):
        self.lesson = lesson
        self.questions = draw_questions(lesson)
        tools = [NEXT_QUESTION_TOOL, HINT_TOOL, EVALUATION_TOOL, DECLENSION_EVALUATION_TOOL, RETRY_TOOL, LANGUAGE_TOOL]
        super().__init__(browser, GeminiLive(voice, prompts.expression_instructions(),
                                                  f"{prompts.EXPRESSION_START} {prompts.language_mode(DEFAULT_LANGUAGE)}", tools))
        self.asked = 0  # questions déjà servies
        self.stage = "question"  # "question" | "declension" : ce que l'élève est en train de faire
        # Un essai est attendu (question posée, déclinaison donnée, ou nouvel essai) et sera évalué ; hors de cette
        # phase, c'est la conversation (une phrase hébraïque n'est évaluée que si le prof y voit un nouvel essai).
        self.answering = False
        self.evaluated = False  # l'essai en cours a déjà été évalué une fois (il y a quelque chose à retenter)
        self.hints_shown = 0
        self.declension: sentence_declension.Declension | None = None
        self.declension_task: asyncio.Task | None = None
        self.pending_question: dict | None = None  # affichée quand le prof commence à la poser
        self.question_served_at = 0.0
        # Fermeture des fenêtres de la question précédente : la nouvelle attend qu'elle soit finie pour s'afficher,
        # même si le prof a déjà commencé à la poser (question_due).
        self.closing = False
        self.question_due = False
        self.heard = ""  # transcription de ce que l'élève a dit depuis le dernier exercice
        self.language = DEFAULT_LANGUAGE  # mode de langue du prof (cf. config)
        self.first_turn_done = False
        # Bilan de la séance : essais réussis et ratés, en expression et en déclinaison.
        self.score = {kind: {"ok": 0, "ko": 0} for kind in ("expression", "declension")}
        self.score_events = 0

    @property
    def current(self) -> dict | None:
        return self.questions[self.asked - 1] if self.asked else None

    async def on_started(self) -> None:
        log.info("Séance d'expression libre lancée · voix %s · leçon %s · %s", self.live.voice, self.lesson,
                 [q["topic"]["id"] for q in self.questions])
        await self.to_browser({"type": "language", "language": self.language})
        await self.send_topics()
        await self.to_browser({"type": "score", "score": self.score, "event": None})

    async def record(self, kind: str, ok: bool) -> None:
        self.score[kind]["ok" if ok else "ko"] += 1
        self.score_events += 1
        await self.to_browser({"type": "score", "score": self.score, "event": {
            "kind": kind, "ok": ok, "question": self.asked, "seq": self.score_events}})

    async def send_topics(self) -> None:
        # Un sujet peut revenir pour deux questions : il n'apparaît qu'une fois au programme.
        ids = list(dict.fromkeys(q["topic"]["id"] for q in self.questions))
        topics = {q["topic"]["id"]: q["topic"] for q in self.questions}
        current = self.current["topic"]["id"] if self.current else None
        covered = {q["topic"]["id"] for q in self.questions[:max(self.asked - 1, 0)]}
        await self.to_browser({"type": "topics", "current": ids.index(current) if current else -1,
                               "covered": [i for i, topic_id in enumerate(ids) if topic_id in covered],
                               "topics": [{key: topics[topic_id][key] for key in ("short", "label", "rule", "details", "course")}
                                          for topic_id in ids]})

    async def tick(self, now: float) -> None:
        if (not self.first_turn_done and self.turn.segments and not self.turn.open
                and 0 < self.playback_until <= now):
            self.first_turn_done = True
            await self.to_browser({"type": "first_turn_done"})
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
        await self.send_topics()

    # --- fonctions du prof ----------------------------------------------------

    async def on_tool_call(self, call: dict) -> None:
        name, args = call["name"], call.get("args") or {}
        respond = lambda response, **kw: self.live.tool_response(call["id"], name, response, **kw)  # noqa: E731
        if name == NEXT_QUESTION_TOOL["name"]:
            if self.asked and self.stage == "question" and self.answering and not self.evaluated:
                log.info("question suivante demandée avant toute réponse : refusée")
                await respond({"consigne": self.in_mode(prompts.EXPRESSION_STILL_ANSWERING)})
                return
            question = await self.next_question()
            if question is None:
                await respond({"consigne": self.in_mode(prompts.NO_MORE_QUESTIONS_ORAL)})
                return
            await respond({"question": question["hebrew"], "traduction": question["french"],
                           "reponse_possible": question["answer"],
                           "consigne": self.in_mode(prompts.QUESTION_GIVEN)})
        elif name == HINT_TOOL["name"]:
            if self.stage != "question" or not self.current:
                await respond({"consigne": self.in_mode(prompts.NO_HINT_NOW)})
                return
            hints = self.current["hints"]
            if self.hints_shown >= len(hints):
                await respond({"consigne": self.in_mode(prompts.NO_MORE_HINTS)})
                return
            self.hints_shown += 1
            hint = hints[self.hints_shown - 1]
            log.info("indice %d/%d : %s", self.hints_shown, len(hints), hint)
            await self.to_browser({"type": "hints", "hints": hints[:self.hints_shown]})
            await respond({"indice": {k: v for k, v in hint.items() if v},
                           "consigne": self.in_mode(prompts.HINT_GIVEN)})
        elif name in (EVALUATION_TOOL["name"], DECLENSION_EVALUATION_TOOL["name"]):
            expected_stage = "question" if name == EVALUATION_TOOL["name"] else "declension"
            # Une déclinaison ne s'évalue qu'une fois affichée (pas pendant sa préparation).
            if (self.stage != expected_stage or not self.current
                    or (expected_stage == "declension" and self.declension is None)):
                await respond({"resultat": self.in_mode(prompts.NOT_RETRYING)})
                return
            if not self.answering:
                # Pendant la conversation, une phrase hébraïque n'est évaluée que si le prof y voit un nouvel essai.
                verdict = args.get("nouvel_essai")
                log.info("évaluation pendant la conversation : %s", verdict)
                if verdict != "oui":
                    await respond({"resultat": self.in_mode(prompts.ASK_IF_RETRY if verdict == "incertain"
                                                            else prompts.NOT_RETRYING)})
                    return
            if expected_stage == "question":
                await self.evaluate_answer(args, respond)
            else:
                await self.evaluate_declension(args, respond)
        elif name == RETRY_TOOL["name"]:
            if not self.evaluated:
                await respond({"consigne": self.in_mode(prompts.NOTHING_TO_RETRY)})
                return
            await self.reopen()
            await respond({"consigne": self.in_mode(prompts.RETRY_OPENED_EXPRESSION)})
        elif name == LANGUAGE_TOOL["name"]:
            await self.set_language(LANGUAGES.get(args.get("langue"), self.language))
            await respond({"consigne": prompts.language_mode(self.language)})
        else:
            await super().on_tool_call(call)

    async def evaluate_answer(self, args: dict, respond) -> None:
        evaluation = await self.evaluation(args, {"fautes_langue": "language", "fautes_sens": "sense"})
        succeeded = perfect(evaluation)
        # La réponse et l'évaluation ne s'affichent que si elle est fausse (cf. demande explicite du user) ; réussie,
        # la question s'efface à l'écran (cf. l'événement du bilan).
        if not succeeded:
            await self.to_browser({"type": "evaluation", "evaluation": evaluation})
        await self.record("expression", succeeded)
        await self.set_answering(False)
        if succeeded:
            # Réponse parfaite : la déclinaison se prépare pendant que le prof félicite l'élève.
            self.stage = "declension"
            self.evaluated = False
            self.declension_task = asyncio.create_task(self.start_declension(evaluation["answer"]))
            self.background.append(self.declension_task)
            await respond({"resultat": self.in_mode(prompts.PERFECT_ANSWER)}, when_idle=True)
        else:
            await respond({"resultat": self.in_mode(prompts.EVALUATION_SHOWN_EXPRESSION)}, when_idle=True)

    async def evaluate_declension(self, args: dict, respond) -> None:
        evaluation = await self.evaluation(args, {"fautes_langue": "language"})
        succeeded = perfect(evaluation)
        if not succeeded:
            await self.to_browser({"type": "declension_evaluation", "evaluation": evaluation})
        await self.record("declension", succeeded)
        await self.set_answering(False)
        await respond({"resultat": self.in_mode(prompts.DECLENSION_SUCCESS if succeeded else prompts.DECLENSION_FAILED)},
                      when_idle=True)

    async def evaluation(self, args: dict, error_kinds: dict[str, str]) -> dict:
        """Évaluation à afficher : réponse en hébreu, commentaires des fautes en français (cf. comprehension.py)."""
        errors = [{"word": str(f.get("mot") or "").strip(), "kind": kind, "comment": str(f.get("commentaire") or "").strip()}
                  for field, kind in error_kinds.items() for f in args.get(field) or [] if isinstance(f, dict)]
        errors = [e for e in errors if e["word"] or e["comment"]]
        for error, text in zip(errors, await french_texts([e["comment"] for e in errors])):
            error["comment"] = text
        self.evaluated = True
        answer = align_error_words(hebrew_answer(args.get("reponse_eleve"), self.heard), errors)
        return {"answer": answer, "errors": errors}

    async def start_declension(self, sentence: str) -> None:
        """Prépare la déclinaison de la phrase réussie, puis l'affiche et la confie au prof dès qu'il a fini de
        féliciter l'élève."""
        declension = await sentence_declension.prepare(sentence, self.current["preferred"])
        deadline = time.monotonic() + TEACHER_IDLE_TIMEOUT
        while (self.turn.open or self.playback_until > time.monotonic()) and time.monotonic() < deadline:
            await asyncio.sleep(0.1)
        if declension is None:
            await self.live.app_message(self.in_mode(prompts.NO_DECLENSION))
            return
        self.declension = declension
        self.heard = ""
        await self.to_browser({"type": "declension", "declension": declension.message(SHOW_DECLENSION_EXPECTED)})
        await self.set_answering(True)
        await self.live.app_message(self.in_mode(prompts.declension_given(
            declension.sentence, declension.word, declension.replacement, declension.expected)))

    # --- enchaînement ---------------------------------------------------------

    async def next_question(self) -> dict | None:
        """Ferme les fenêtres de la question en cours, puis sert la suivante (None s'il n'y en a plus)."""
        if self.declension_task and not self.declension_task.done():
            self.declension_task.cancel()
        if self.asked >= len(self.questions):
            # Fin de la séance : la dernière question reste à l'écran.
            await self.set_answering(False)
            await self.to_browser({"type": "phase", "phase": "done"})
            return None
        if self.asked:
            await self.close_windows()
        self.asked += 1
        question = self.current
        log.info("question %d/%d (%s) : %s", self.asked, len(self.questions), question["topic"]["id"],
                 question["hebrew"])
        self.stage = "question"
        self.evaluated = False
        self.hints_shown = 0
        self.declension = None
        self.heard = ""
        # number ne s'affiche pas : il distingue seulement une question de la suivante à l'écran.
        self.pending_question = {"number": self.asked, "hebrew": question["hebrew"]}
        self.question_served_at = time.monotonic()
        # La question ne s'affiche que dans sa fenêtre : la prise de parole qui la pose n'est pas affichée.
        self.end_turn()
        self.hidden_turn = True
        await self.set_answering(True)
        return question

    async def close_windows(self) -> None:
        """Les fenêtres de la question se ferment de bas en haut, puis disparaissent (cf. demande explicite du user)."""
        await self.to_browser({"type": "closing"})
        self.closing, self.question_due = True, False

        async def clear() -> None:
            await asyncio.sleep(CLOSING_SECONDS)
            for message in ({"type": "declension_evaluation", "evaluation": None},
                            {"type": "declension", "declension": None}, {"type": "evaluation", "evaluation": None},
                            {"type": "hints", "hints": []}, {"type": "question", "question": None}):
                await self.to_browser(message)
            self.closing = False
            if self.question_due and self.pending_question:
                await self.show_question()

        self.background.append(asyncio.create_task(clear()))

    async def reopen(self) -> None:
        """Nouvel essai sur l'exercice en cours : seule son évaluation disparaît."""
        kind = "declension_evaluation" if self.stage == "declension" else "evaluation"
        await self.to_browser({"type": kind, "evaluation": None})
        self.heard = ""
        await self.set_answering(True)

    async def on_browser_message(self, data: dict) -> None:
        if data.get("type") == "language" and data.get("language") in prompts.LANGUAGE_NAMES:
            if data["language"] != self.language:
                await self.set_language(data["language"])
                speaking = await self.cut_teacher()
                await (self.live.app_message if speaking else self.live.note)(prompts.language_switched(self.language))
            return
        # Les boutons servent après une évaluation ; « Question suivante » aussi pendant une déclinaison (la passer).
        if data.get("type") not in ("next", "retry") or not (self.evaluated or (
                data["type"] == "next" and self.stage == "declension")):
            return
        await self.cut_teacher()
        if data["type"] == "retry":
            await self.reopen()
            await self.live.note(self.in_mode(prompts.RETRY_BY_BUTTON))
            return
        question = await self.next_question()
        await self.live.app_message(self.in_mode(
            prompts.NO_MORE_QUESTIONS_BY_BUTTON if question is None else prompts.NEXT_BY_BUTTON + question["hebrew"]))

    async def set_language(self, language: str) -> None:
        log.info("mode de langue : %s", language)
        self.language = language
        await self.to_browser({"type": "language", "language": language})

    def in_mode(self, message: str) -> str:
        return f"{message} {prompts.language_mode(self.language)}"

    async def set_answering(self, answering: bool) -> None:
        self.answering = answering
        await self.to_browser({"type": "answering", "answering": answering})

    async def on_user_text(self, text: str) -> None:
        self.heard += text
