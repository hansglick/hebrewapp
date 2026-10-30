"""Tâche « Question » (cf. demande explicite du user), dans le gabarit de la déclinaison : l'application tire
SENTENCES_PER_ROUND phrases des leçons cochées et les écrit au tableau, chacune avec sa cible surlignée (les mots qui
portent l'information demandée, cf. scripts/build_revision_question_targets.py) ; l'élève pose à voix haute la
question qui a cette phrase pour réponse, et dont la réponse est justement la cible. Le prof relève les fautes de
langue, un modèle rapide (QUESTION_MODEL) juge si la question vise bien la cible et s'adresse à l'élève (« je » →
« tu », « nous » → « vous »). Réussie, l'application enchaîne d'elle-même ; ratée, le prof commente et l'élève
retente de vive voix ou passe avec « Question suivante ».

Indice : le mot interrogatif en français (« où ? »), seulement à la demande. Une pastille l'offre quand l'élève a
déjà raté la phrase, hésite (plus de HESITATION_SECONDS de silence après la consigne) ou dit qu'il ne sait pas ; le
prof n'en parle jamais.

Messages propres à la tâche (backend → navigateur, en plus de ceux de session.py) :
  {"type": "exercise", "exercise": {"number": int, "sentence", "spans": [[début, fin]]} | null}
  {"type": "hint", "hint": {"offered": bool, "text": str | null}}
  {"type": "evaluation", "evaluation": {"answer", "errors"} | null}
  {"type": "closing"}, {"type": "score", ...}, {"type": "answering", ...}, {"type": "language", ...},
  {"type": "first_turn_done"}, {"type": "phase", "phase": "done"}   (cf. declension.py)
  {"type": "question", "question": null}                             (fin de la fermeture des fenêtres)
  {"type": "answer_frame"}             (l'élève prend la parole une première fois : la fenêtre « Réponse » apparaît)
Navigateur → backend : {"type": "next"}, {"type": "hint"}, {"type": "language", "language": "he" | "fr"}.
"""

import asyncio
import json
import logging
import random
import time
from dataclasses import dataclass

from fastapi import WebSocket

from app.revision_agent import prompts
from app.revision_agent.comprehension import LANGUAGE_TOOL, LANGUAGES
from app.revision_agent.config import DEFAULT_LANGUAGES, QUESTION_MODEL
from app.revision_agent.evaluation import HEBREW_LETTER, align_error_words, french_texts, hebrew_answer
from app.revision_agent.expression import (ANSWER, CLOSING_SECONDS, RETRY_TOOL, RETRY_VERDICT, TEACHER_IDLE_TIMEOUT,
                                           error_list)
from app.revision_agent.gemini_live import GeminiLive
from app.revision_agent.passages import lesson_number
from app.revision_agent.session import TeacherSession
from app.revision_agent.translate import translate
from app.revision_agent.utterances import lesson_utterances, sentence_key, word_span

log = logging.getLogger("revision_agent.question")

SENTENCES_PER_ROUND = 6  # comme la déclinaison
CURRENT_LESSON_SENTENCES = 2  # phrases de la leçon en cours quand les leçons antérieures sont aussi cochées
HESITATION_SECONDS = 5  # silence de l'élève après la consigne au-delà duquel l'indice lui est offert
TEACHER_START_TIMEOUT = 4  # après une réussite, délai laissé au prof pour commencer à féliciter l'élève

NEXT_SENTENCE_TOOL = {
    "name": "phrase_suivante",
    "description": "Passe à la phrase suivante : ferme les fenêtres de la phrase en cours, affiche la nouvelle à "
                   "l'écran de l'élève (sa cible surlignée) et te renvoie l'exercice (phrase, cible, question "
                   "attendue, à ne jamais dire).",
    # Bloquante : le prof attend l'exercice avant de donner la consigne.
}

QUESTION_EVALUATION_TOOL = {
    "name": "evaluer_question",
    "description": "Affiche à l'écran de l'élève l'évaluation de sa question : sa question, ses fautes surlignées et "
                   "commentées.",
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "nouvel_essai": RETRY_VERDICT,
            "reponse_eleve": ANSWER,
            "fautes_langue": error_list(
                "Chaque faute de langue de la question, dans l'ordre : verbe mal conjugué, accord oublié, mot mal "
                "dit… ([] s'il n'y en a pas). Pas le choix du mot interrogatif ni de la personne : l'application "
                "les juge elle-même"),
        },
        "required": ["nouvel_essai", "reponse_eleve", "fautes_langue"],
    },
    "behavior": "NON_BLOCKING",
}

HESITATION_TOOL = {
    "name": "eleve_bloque",
    "description": "L'élève dit qu'il ne sait pas, qu'il ne trouve pas, ou demande de l'aide pour la phrase en cours.",
}

# Jugement de la visée par le modèle rapide (cf. demande explicite du user).
TARGET_PROMPT = """Tu es professeur d'hébreu. Exercice : l'élève voit une phrase hébraïque dont une partie, la
cible, est surlignée ; il doit poser à voix haute la question dont la réponse est justement la cible, la phrase en
étant la réponse naturelle. Tu reçois la phrase, la cible, la ou les questions attendues et la question de l'élève
(transcrite de l'oral, éventuellement avec des fautes de langue : ne les juge pas, un autre s'en charge).
Dis si la question de l'élève vise bien la cible :
- Sa réponse doit être exactement l'information de la cible : un autre mot interrogatif qui demande autre chose
  (« qui ? » au lieu de « où ? ») ou une question sur une autre partie de la phrase est faux.
- Toute formulation qui demande la même information est juste, même différente des questions attendues
  (« איפה את גרה? », « באיזו עיר את גרה? », « את גרה איפה? »), même avec des mots plus avancés.
- La question s'adresse à la personne qui a dit la phrase : une phrase à la 1re personne (אני, אנחנו, לי, שלי…)
  appelle une question à la 2e (« tu », « vous » : את / אתה, אתם / אתן, לך…), et inversement. Garder « je » ou
  « nous » est faux. Le genre suit celui de la phrase quand il s'entend, sinon les deux genres sont justes.
- Une question fermée (oui / non) ou une simple répétition de la phrase est fausse.
Si c'est faux, donne chaque problème : le mot de la question de l'élève qui le porte, recopié exactement (vide si
aucun mot précis), et un commentaire en français, en quelques mots, factuel, qui ne donne JAMAIS la question
attendue, ni le bon mot interrogatif, ni la bonne forme (« ta question porte sur la personne, pas sur
l'information surlignée », « tu dois t'adresser à lui : pas « je » mais la 2e personne »)."""

TARGET_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "vise_la_cible": {"type": "BOOLEAN"},
        "problemes": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {"mot": {"type": "STRING"}, "commentaire": {"type": "STRING"}},
                "required": ["mot", "commentaire"],
            },
        },
    },
    "required": ["vise_la_cible", "problemes"],
}


@dataclass
class Item:
    lesson: str
    sentence: str  # la phrase affichée, réponse de la question
    target: list[str]  # morceaux de la phrase qui portent l'information demandée
    spans: list[tuple[int, int]]  # leur position dans sentence
    hint: str  # mot interrogatif en français (« où ? »)
    questions: list[str]  # questions attendues (deux, rarement, pour une même cible)
    interrogative: str


def items_for(lesson: str, u: dict) -> list[Item]:
    """Un exercice par cible de l'énoncé ; deux questions de même cible n'en font qu'un, qui les accepte toutes deux
    (cf. demande explicite du user)."""
    by_target: dict[tuple[str, ...], list[dict]] = {}
    for q in u.get("questions") or []:
        if q.get("target"):
            by_target.setdefault(tuple(q["target"]), []).append(q)
    items = []
    for target, questions in by_target.items():
        spans = [word_span(u["text"], piece) for piece in target]
        if all(spans):
            items.append(Item(lesson, u["text"], list(target), spans, questions[0]["hint"],
                              [q["he"] for q in questions], questions[0]["interrogative"]))
    return items


def rotate(items: list[Item], seen: set[tuple[str, ...]]) -> list[Item]:
    """Les exercices, un mot interrogatif après l'autre, en tournant (tous avant d'en reprendre un), jamais deux fois
    la même phrase, ni une simple variante (cf. sentence_key ; seen : les phrases déjà prises)."""
    pools: dict[str, list[Item]] = {}
    for item in random.sample(items, len(items)):
        pools.setdefault(item.interrogative, []).append(item)
    order = list(pools.values())
    random.shuffle(order)
    drawn = []
    while any(order):
        for pool in order:
            while pool:
                item = pool.pop(0)
                if sentence_key(item.sentence) not in seen:
                    seen.add(sentence_key(item.sentence))
                    drawn.append(item)
                    break
    return drawn


def draw_items(lesson: str, current: bool, previous: bool) -> list[Item]:
    """Toutes les phrases possibles, dans l'ordre du tirage (cf. rotate) : les SENTENCES_PER_ROUND premières font la
    séance. Seulement les leçons cochées, comme la déclinaison : les deux cochées, CURRENT_LESSON_SENTENCES phrases
    viennent de la leçon en cours (cf. declension.draw_items)."""
    level = lesson_number(lesson)
    seen: set[tuple[str, ...]] = set()
    mine = rotate([i for code, u in lesson_utterances(lesson, True, False) for i in items_for(code, u)],
                  seen) if current else []
    older = rotate([i for code, u in lesson_utterances(lesson, False, True) for i in items_for(code, u)],
                   seen) if previous else []
    if not (mine and older) or level is None:
        return mine or older
    count = max(min(CURRENT_LESSON_SENTENCES, len(mine)), SENTENCES_PER_ROUND - len(older))
    session = mine[:count] + older[:SENTENCES_PER_ROUND - count]
    random.shuffle(session)
    return session + mine[count:] + older[SENTENCES_PER_ROUND - count:]


async def judge_target(item: Item, question: str) -> list[dict]:
    """Problèmes de visée de la question de l'élève ([] si elle vise bien la cible)."""
    request = json.dumps({"phrase": item.sentence, "cible": " … ".join(item.target),
                          "questions_attendues": item.questions, "question_eleve": question}, ensure_ascii=False)
    try:
        result = json.loads(await translate(request, TARGET_PROMPT, TARGET_SCHEMA, QUESTION_MODEL))
    except Exception:
        log.exception("Jugement de la visée impossible : %s", question)
        return []
    log.info("visée : %s", result)
    if result.get("vise_la_cible"):
        return []
    problems = [{"word": str(p.get("mot") or "").strip(), "kind": "sense",
                 "comment": str(p.get("commentaire") or "").strip()}
                for p in result.get("problemes") or [] if isinstance(p, dict)]
    return [p for p in problems if p["comment"]] or [
        {"word": "", "kind": "sense", "comment": "ta question ne demande pas l'information surlignée"}]


class QuestionSession(TeacherSession):
    def __init__(self, browser: WebSocket, voice: str, lesson: str, items: list[Item]):
        self.lesson = lesson
        self.items = items[:SENTENCES_PER_ROUND]
        tools = [NEXT_SENTENCE_TOOL, QUESTION_EVALUATION_TOOL, HESITATION_TOOL, RETRY_TOOL, LANGUAGE_TOOL]
        super().__init__(browser, GeminiLive(voice, prompts.question_instructions(len(self.items)),
                                             f"{prompts.QUESTION_START} {prompts.language_mode(DEFAULT_LANGUAGES["question"])}",
                                             tools))
        self.asked = 0  # phrases déjà servies
        # Un essai est attendu (phrase donnée, ou nouvel essai) ; hors de cette phase, c'est la conversation.
        self.answering = False
        self.evaluated = False  # la phrase en cours a déjà été évaluée une fois
        self.failed = False  # la phrase en cours a déjà été ratée une fois
        self.closing = False
        self.pending: list[dict] | None = None
        self.heard = ""  # transcription de ce que l'élève a dit depuis la phrase donnée
        self.language = DEFAULT_LANGUAGES["question"]
        self.first_turn_done = False
        self.score = {"question": {"ok": 0, "ko": 0}}
        self.score_events = 0
        self.finished = False
        self.advance_task: asyncio.Task | None = None
        self.intro_cut = False  # cf. declension.py
        # Question non évaluée par le prof (cf. declension.py) ; silence de l'élève (cf. HESITATION_SECONDS).
        self.attempt_at: float | None = None
        self.turn_started_at = 0.0
        self.nudged = 0
        self.given_at = 0.0  # moment où la phrase en cours a été servie
        self.spoke_at = 0.0  # dernière transcription de l'élève
        self.hint = {"offered": False, "text": None}
        self.answer_frame = False  # la fenêtre « Réponse » est apparue

    @property
    def current(self) -> Item | None:
        return self.items[self.asked - 1] if self.asked else None

    async def on_started(self) -> None:
        log.info("Séance « question » lancée · voix %s · leçon %s · %s", self.live.voice, self.lesson,
                 [(i.sentence, i.target, i.questions) for i in self.items])
        await self.to_browser({"type": "language", "language": self.language})
        await self.to_browser({"type": "score", "score": self.score, "event": None})

    async def on_event(self, event) -> None:
        if not self.asked:
            if event.kind == "interrupted":
                self.intro_cut = True
            elif event.kind == "agent_text":
                self.intro_cut = False
        if event.kind == "agent_text" and not self.turn.open:
            self.turn_started_at = time.monotonic()
        await super().on_event(event)
        if event.kind == "turn_complete":
            await self.check_evaluated()

    async def tick(self, now: float) -> None:
        if (not self.first_turn_done and self.turn.segments and not self.turn.open
                and 0 < self.playback_until <= now):
            self.first_turn_done = True
            await self.to_browser({"type": "first_turn_done"})
        # Hésitation : la consigne est dite, le prof se tait, l'élève aussi depuis HESITATION_SECONDS.
        if (self.answering and not self.hint["offered"] and not self.closing and self.attempt_at is None
                and self.turn_started_at > self.given_at and not self.turn.open
                and now - max(self.playback_until, self.spoke_at) > HESITATION_SECONDS):
            log.info("l'élève hésite : indice offert")
            await self.offer_hint()

    # --- indice -----------------------------------------------------------------

    async def offer_hint(self) -> None:
        if self.current and not self.hint["offered"] and not self.finished:
            self.hint = {"offered": True, "text": None}
            await self.to_browser({"type": "hint", "hint": self.hint})

    async def show_hint(self) -> None:
        if self.current and self.hint["offered"] and not self.hint["text"]:
            log.info("indice affiché : %s", self.current.hint)
            self.hint = {"offered": True, "text": self.current.hint}
            await self.to_browser({"type": "hint", "hint": self.hint})

    # --- suivi --------------------------------------------------------------------

    async def record(self, ok: bool) -> None:
        self.score["question"]["ok" if ok else "ko"] += 1
        self.score_events += 1
        await self.to_browser({"type": "score", "score": self.score, "event": {
            "kind": "question", "ok": ok, "question": self.asked, "seq": self.score_events}})

    # --- fonctions du prof ----------------------------------------------------

    async def on_tool_call(self, call: dict) -> None:
        name, args = call["name"], call.get("args") or {}
        respond = lambda response, **kw: self.live.tool_response(call["id"], name, response, **kw)  # noqa: E731
        if name == NEXT_SENTENCE_TOOL["name"]:
            if not self.asked and self.intro_cut:
                log.info("première phrase demandée après un accueil coupé : refusée")
                await respond({"consigne": self.in_mode(prompts.INTRO_CUT)})
                return
            if self.asked and self.answering and not self.evaluated:
                log.info("phrase suivante demandée avant toute réponse : refusée")
                await respond({"consigne": self.in_mode(
                    prompts.question_not_evaluated(self.heard.strip()) if self.attempt_at is not None
                    else prompts.QUESTION_STILL_ANSWERING)})
                return
            self.cancel_advance()
            await respond({"consigne": self.in_mode(await self.next_sentence())})
        elif name == QUESTION_EVALUATION_TOOL["name"]:
            if self.current is None:
                await respond({"resultat": self.in_mode(prompts.NOT_RETRYING)})
                return
            if not self.answering:
                verdict = args.get("nouvel_essai")
                log.info("évaluation pendant la conversation : %s", verdict)
                if verdict != "oui":
                    await respond({"resultat": self.in_mode(prompts.ASK_IF_RETRY if verdict == "incertain"
                                                            else prompts.NOT_RETRYING)})
                    return
            await self.evaluate(args, respond)
        elif name == HESITATION_TOOL["name"]:
            await self.offer_hint()
            await respond({"consigne": self.in_mode(prompts.QUESTION_HESITATION)})
        elif name == RETRY_TOOL["name"]:
            if not self.evaluated:
                await respond({"consigne": self.in_mode(prompts.NOTHING_TO_RETRY)})
                return
            await self.to_browser({"type": "evaluation", "evaluation": None})
            self.heard = ""
            await self.set_answering(True)
            await respond({"consigne": self.in_mode(prompts.RETRY_OPENED_EXPRESSION)})
        elif name == LANGUAGE_TOOL["name"]:
            await self.set_language(LANGUAGES.get(args.get("langue"), self.language))
            await respond({"consigne": prompts.language_mode(self.language)})
        else:
            await super().on_tool_call(call)

    async def evaluate(self, args: dict, respond) -> None:
        """Fautes de langue relevées par le prof, visée jugée par le modèle rapide ; l'évaluation s'affiche dans tous
        les cas. Réussie, l'application enchaîne d'elle-même (cf. advance)."""
        item = self.current
        answer = hebrew_answer(args.get("reponse_eleve"), self.heard)
        language = [{"word": str(f.get("mot") or "").strip(), "kind": "language",
                     "comment": str(f.get("commentaire") or "").strip()}
                    for f in args.get("fautes_langue") or [] if isinstance(f, dict)]
        language = [e for e in language if e["word"] or e["comment"]]
        texts, aim = await asyncio.gather(french_texts([e["comment"] for e in language]), judge_target(item, answer))
        for error, text in zip(language, texts):
            error["comment"] = text
        errors = aim + language
        self.evaluated = True
        await self.to_browser({"type": "evaluation", "evaluation": {
            "answer": align_error_words(answer, errors), "errors": errors}})
        succeeded = not errors
        await self.record(succeeded)
        await self.set_answering(False)
        if not succeeded and not self.failed:
            self.failed = True
            await self.offer_hint()
        await respond({"resultat": self.in_mode(prompts.QUESTION_TASK_SUCCESS if succeeded
                                                else prompts.QUESTION_FAILED)}, when_idle=True)
        if succeeded:
            self.cancel_advance()
            self.advance_task = asyncio.create_task(self.advance())
            self.background.append(self.advance_task)

    async def check_evaluated(self) -> None:
        """Le prof vient de répondre à une question en hébreu de l'élève sans l'évaluer : on le relance, une fois
        (cf. declension.py)."""
        if (self.answering and not self.evaluated and self.attempt_at is not None
                and self.turn_started_at > self.attempt_at and self.nudged != self.asked and not self.finished):
            self.nudged = self.asked
            log.info("question de l'élève non évaluée : relance du prof")
            await self.live.app_message(self.in_mode(prompts.question_not_evaluated(self.heard.strip())))

    # --- enchaînement ---------------------------------------------------------

    async def advance(self) -> None:
        """Sert la phrase suivante dès que le prof a fini de féliciter l'élève (cf. declension.py)."""
        speaking = lambda: self.turn.open or self.playback_until > time.monotonic()  # noqa: E731
        deadline = time.monotonic() + TEACHER_START_TIMEOUT
        while not speaking() and time.monotonic() < deadline:
            await asyncio.sleep(0.1)
        deadline = time.monotonic() + TEACHER_IDLE_TIMEOUT
        while speaking() and time.monotonic() < deadline:
            await asyncio.sleep(0.1)
        if self.closing or self.finished:
            return
        instruction = await self.next_sentence()
        await self.live.app_message(self.in_mode(f"{prompts.NEXT_SENTENCE_AFTER_SUCCESS} {instruction}"))

    def cancel_advance(self) -> None:
        if self.advance_task and not self.advance_task.done() and self.advance_task is not asyncio.current_task():
            self.advance_task.cancel()
        self.advance_task = None

    async def next_sentence(self) -> str:
        """Ferme les fenêtres de la phrase en cours, sert la suivante et renvoie la consigne pour le prof."""
        if self.asked >= len(self.items):
            await self.finish()
            return prompts.NO_MORE_SENTENCES
        if self.asked:
            await self.close_windows()
        self.asked += 1
        item = self.current
        log.info("phrase %d/%d : %s · cible %s · %s", self.asked, len(self.items), item.sentence, item.target,
                 item.questions)
        self.evaluated = self.failed = False
        self.heard = ""
        self.attempt_at = None
        self.given_at = time.monotonic()
        self.hint = {"offered": False, "text": None}
        messages = [{"type": "hint", "hint": self.hint},
                    {"type": "exercise", "exercise": {"number": self.asked, "sentence": item.sentence,
                                                      "spans": [list(span) for span in item.spans]}}]
        if self.closing:
            self.pending = messages
        else:
            for message in messages:
                await self.to_browser(message)
        await self.set_answering(True)
        return prompts.question_exercise(self.asked, item.sentence, " … ".join(item.target), item.questions)

    async def finish(self) -> None:
        if not self.finished:
            self.finished = True
            await self.set_answering(False)
            await self.to_browser({"type": "hint", "hint": {"offered": False, "text": None}})
            await self.to_browser({"type": "phase", "phase": "done"})

    async def close_windows(self) -> None:
        """La fenêtre de la réponse se ferme de bas en haut, puis la phrase suivante s'écrit au tableau (cf.
        declension.py)."""
        await self.to_browser({"type": "closing"})
        self.closing, self.pending = True, None

        async def clear() -> None:
            await asyncio.sleep(CLOSING_SECONDS)
            await self.to_browser({"type": "evaluation", "evaluation": None})
            await self.to_browser({"type": "exercise", "exercise": None})
            # Fin de la fermeture (cf. useRevisionSession, closing).
            await self.to_browser({"type": "question", "question": None})
            self.closing = False
            if self.pending:
                messages, self.pending = self.pending, None
                for message in messages:
                    await self.to_browser(message)

        self.background.append(asyncio.create_task(clear()))

    async def on_browser_message(self, data: dict) -> None:
        if data.get("type") == "language" and data.get("language") in prompts.LANGUAGE_NAMES:
            if data["language"] != self.language:
                await self.set_language(data["language"])
                speaking = await self.cut_teacher()
                await (self.live.app_message if speaking else self.live.note)(prompts.language_switched(self.language))
            return
        if data.get("type") == "hint":
            await self.show_hint()
            return
        # « Question suivante » : après une évaluation, ou pour passer la phrase en cours.
        if data.get("type") != "next" or not self.current or self.closing or self.finished:
            return
        self.cancel_advance()
        await self.cut_teacher()
        instruction = await self.next_sentence()
        await self.live.app_message(self.in_mode(f"{prompts.NEXT_SENTENCE_BY_BUTTON} {instruction}"))

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
        if self.answering and not self.answer_frame and text.strip():
            # Il prend la parole pour répondre : la fenêtre « Réponse » s'ouvre (cf. demande explicite du user).
            self.answer_frame = True
            await self.to_browser({"type": "answer_frame"})
        now = time.monotonic()
        self.spoke_at = now
        # Un essai : de l'hébreu dit pendant que le prof se tait (pas l'écho de sa voix).
        if self.answering and HEBREW_LETTER.search(text) and self.playback_until <= now:
            self.attempt_at = now
