"""Tâche « Complétion » (cf. demande explicite du user), dans le gabarit de la question : l'application tire
SENTENCES_PER_ROUND débuts de phrase, chacun avec un concept des leçons cochées, et écrit au tableau le début de la
phrase et sa contrainte, en style télégraphique (« utilise la préposition de direction ל », cf.
scripts/build_revision_completion_constraints.py). L'élève complète la phrase à voix haute, librement : toute suite
plausible qui respecte la contrainte est juste. Le prof relève les fautes de langue, un modèle rapide
(COMPLETION_MODEL) juge la contrainte et la plausibilité. Réussie, l'application enchaîne d'elle-même ; ratée, le
prof commente et l'élève retente de vive voix ou passe avec « Complétion suivante ». La phrase d'origine ne s'affiche
jamais.

Indices, seulement à la demande, l'un après l'autre : l'action de la phrase (« se rendre quelque part »), puis le
début prolongé jusqu'au mot du concept (truncated_two), qui remplace le début au tableau. Une pastille offre le
suivant quand l'élève rate la phrase, hésite (plus de HESITATION_SECONDS de silence) ou dit qu'il ne sait pas ;
cliquée, elle disparaît et l'indice s'affiche ; le prof n'en parle jamais.

Un concept est « vu » à partir de sa leçon : « Leçon en cours » prend les concepts de la leçon choisie, « Leçons
antérieures » ceux des leçons d'avant, toujours dans des phrases des leçons déjà vues. À droite, le programme (cf.
Program.jsx) présente tous les concepts retenus par les cases cochées, celui de la phrase en cours en bleu, son petit
cours déroulé (celui de l'expression libre, cf. expression_topic_texts.json).

Messages propres à la tâche (backend → navigateur, en plus de ceux de session.py) :
  {"type": "exercise", "exercise": {"number": int, "prefix": str, "constraint": str} | null}
  {"type": "hint", "hint": {"offered": bool, "action": str | null, "prefix": str | null}}
        (offered : la pastille est là ; action, prefix : les indices déjà affichés)
  {"type": "evaluation", "evaluation": {"answer", "errors", "dimensions": [{"name", "ok", "text"}]} | null}
  {"type": "topics", "topics": [{"short", "label", "rule", "details", "course"}], "current": int, "covered": [int]}
  {"type": "closing"}, {"type": "score", ...}, {"type": "answering", ...}, {"type": "language", ...},
  {"type": "first_turn_done"}, {"type": "phase", "phase": "done"}, {"type": "question", "question": null},
  {"type": "answer_frame"}                                            (cf. question.py)
Navigateur → backend : {"type": "next"}, {"type": "hint"}, {"type": "language", "language": "he" | "fr"}.
"""

import asyncio
import json
import logging
import random
import time
from dataclasses import dataclass
from functools import lru_cache

from fastapi import WebSocket

from app.config import DATA_DIR
from app.revision_agent import prompts
from app.revision_agent.comprehension import LANGUAGE_TOOL, LANGUAGES
from app.revision_agent.config import COMPLETION_MODEL
from app.revision_agent.evaluation import HEBREW_LETTER, align_error_words, french_texts, hebrew_answer, letters
from app.revision_agent.expression import (ANSWER, CLOSING_SECONDS, RETRY_TOOL, RETRY_VERDICT, TEACHER_IDLE_TIMEOUT,
                                           error_list)
from app.revision_agent.gemini_live import GeminiLive
from app.revision_agent.passages import lesson_number
from app.revision_agent.session import TeacherSession
from app.revision_agent.translate import translate
from app.revision_agent.utterances import lesson_utterances, sentence_key

log = logging.getLogger("revision_agent.completion")

SENTENCES_PER_ROUND = 6  # comme la question (cf. demande explicite du user)
CURRENT_LESSON_SENTENCES = 2  # phrases du concept de la leçon en cours quand les leçons antérieures sont aussi cochées
HESITATION_SECONDS = 5  # silence de l'élève au-delà duquel la pastille de l'indice apparaît
TEACHER_START_TIMEOUT = 4  # après une réussite, délai laissé au prof pour commencer à féliciter l'élève
LANGUAGE = "fr"  # mode de langue de départ (cf. demande explicite du user)
# Libellé court d'un concept sans petit cours (cf. concept_topic).
SHORT_TITLES = {"0.18": "Sensations : קר לי, חם לי"}

NEXT_SENTENCE_TOOL = {
    "name": "phrase_suivante",
    "description": "Passe à la phrase suivante : ferme les fenêtres de la phrase en cours, affiche le nouveau début "
                   "de phrase et sa contrainte à l'écran de l'élève et te renvoie l'exercice.",
    # Bloquante : le prof attend l'exercice avant de donner la consigne.
}

COMPLETION_EVALUATION_TOOL = {
    "name": "evaluer_completion",
    "description": "Affiche à l'écran de l'élève l'évaluation de sa phrase : sa phrase, ses fautes surlignées et "
                   "commentées.",
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "nouvel_essai": RETRY_VERDICT,
            "reponse_eleve": ANSWER,
            "fautes_langue": error_list(
                "Chaque faute de langue de la phrase, dans l'ordre : verbe mal conjugué, accord oublié, préposition "
                "fausse, mot mal dit… ([] s'il n'y en a pas). Pas le respect de la contrainte ni le sens de la "
                "phrase : l'application les juge elle-même"),
        },
        "required": ["nouvel_essai", "reponse_eleve", "fautes_langue"],
    },
    "behavior": "NON_BLOCKING",
}

HESITATION_TOOL = {
    "name": "eleve_bloque",
    "description": "L'élève dit qu'il ne sait pas, qu'il ne trouve pas, ou demande de l'aide pour la phrase en cours.",
}

# Jugement de la contrainte et de la plausibilité par le modèle rapide (cf. demande explicite du user).
COMPLETION_PROMPT = """Tu es professeur d'hébreu. Exercice de complétion pour débutants : l'élève voit le début d'une
phrase hébraïque et une contrainte de grammaire, et complète la phrase à voix haute, librement. Tu reçois le début,
la contrainte, le concept de grammaire qu'elle fait pratiquer, l'action de la phrase d'origine (une simple
référence : l'élève n'est pas tenu de la suivre) et la phrase de l'élève (transcrite de l'oral, éventuellement avec
des fautes de langue : ne les juge pas, un autre s'en charge).
Juge deux choses :
- contrainte : la suite de l'élève emploie bien l'outil de grammaire demandé, de la façon demandée (« exprime une
  absence avec אין + ל » : une possession avec יש est fausse ; « utilise la préposition de direction ל » : une
  destination sans ל, ou avec ב, est fausse). Une forme mal accordée ou mal déclinée de cet outil reste une faute de
  langue, pas un manquement à la contrainte.
- plausibilité : la phrase entière, début compris, a un sens et pourrait se dire dans la vie courante (« דוד נוסע
  לשולחן » ne l'est pas). Toute suite sensée est juste, même très différente de l'action, même très simple, même
  avec des mots plus avancés que le niveau.
Pour chacune, un texte en français, en quelques mots, factuel, qui décrit la phrase de l'élève sur ce point
(« tu emploies bien ל devant la destination », « la phrase n'a pas de sens : on ne voyage pas vers une table »).
Pour chaque problème, le mot de la phrase de l'élève qui le porte, recopié exactement (vide si aucun mot précis), et
un commentaire en français, en quelques mots. Ni les textes ni les commentaires ne donnent JAMAIS la solution : ni
la bonne forme, ni une suite possible.
Tout mot hébreu cité s'écrit en écriture hébraïque."""

COMPLETION_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "contrainte_respectee": {"type": "BOOLEAN"},
        "texte_contrainte": {"type": "STRING"},
        "plausible": {"type": "BOOLEAN"},
        "texte_plausibilite": {"type": "STRING"},
        "problemes": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {"mot": {"type": "STRING"}, "commentaire": {"type": "STRING"}},
                "required": ["mot", "commentaire"],
            },
        },
    },
    "required": ["contrainte_respectee", "texte_contrainte", "plausible", "texte_plausibilite", "problemes"],
}


@dataclass
class Item:
    lesson: str  # leçon de la phrase
    concept: str  # leçon du concept
    sentence: str  # phrase d'origine, jamais affichée
    prefix: str  # début affiché (truncated_one)
    longer: str  # second indice : le début prolongé jusqu'au mot du concept (truncated_two)
    constraint: str  # contrainte affichée, en style télégraphique
    action: str  # premier indice : l'action de la phrase, en français
    definition: str  # le concept, en français


def items_for(lesson: str, u: dict, level: int) -> list[Item]:
    """Un exercice par concept de l'énoncé déjà vu au niveau level, s'il a une contrainte et un début à afficher
    (concept en tout début de phrase : écarté, cf. demande explicite du user)."""
    items = []
    for c in u["concepts"]:
        concept = lesson_number(c["id"])
        prefix = (c.get("truncated_one") or "").strip()
        if concept is not None and concept <= level and c.get("constraint") and HEBREW_LETTER.search(prefix):
            items.append(Item(lesson, c["id"], u["text"], prefix, (c.get("truncated_two") or "").strip(),
                              c["constraint"], (u.get("action") or {}).get("fr", ""), c["definition"]))
    return items


def rotate(items: list[Item], seen: set[tuple[str, ...]]) -> list[Item]:
    """Les exercices, un concept après l'autre, en tournant, jamais deux fois la même phrase, ni une simple variante
    (cf. question.rotate ; seen : les phrases déjà prises)."""
    pools: dict[str, list[Item]] = {}
    for item in random.sample(items, len(items)):
        pools.setdefault(item.concept, []).append(item)
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


def candidates(lesson: str) -> list[Item]:
    """Tous les exercices possibles au niveau lesson : phrases des leçons déjà vues, concepts déjà vus."""
    level = lesson_number(lesson)
    if level is None:
        return []
    return [i for code, u in lesson_utterances(lesson, True, True) for i in items_for(code, u, level)]


def draw_items(lesson: str, current: bool, previous: bool) -> list[Item]:
    """Les exercices, dans l'ordre du tirage : les SENTENCES_PER_ROUND premiers font la séance (moins s'il n'y en a
    pas assez : la séance est écourtée). Les deux cases cochées, CURRENT_LESSON_SENTENCES viennent du concept de la
    leçon en cours (cf. question.draw_items)."""
    seen: set[tuple[str, ...]] = set()
    items = candidates(lesson)
    mine = rotate([i for i in items if i.concept == lesson], seen) if current else []
    older = rotate([i for i in items if i.concept != lesson], seen) if previous else []
    if not (mine and older):
        return mine or older
    count = max(min(CURRENT_LESSON_SENTENCES, len(mine)), SENTENCES_PER_ROUND - len(older))
    session = mine[:count] + older[:SENTENCES_PER_ROUND - count]
    random.shuffle(session)
    return session + mine[count:] + older[SENTENCES_PER_ROUND - count:]


def qualified_concepts(lesson: str, current: bool, previous: bool) -> list[str]:
    """Les concepts retenus par les cases cochées (ceux qui ont au moins un exercice), dans l'ordre des leçons."""
    concepts = {i.concept for i in candidates(lesson)
                if (current and i.concept == lesson) or (previous and i.concept != lesson)}
    return sorted(concepts, key=lesson_number)


@lru_cache(maxsize=1)
def topic_texts() -> tuple[dict, dict]:
    """Le petit cours de chaque concept (celui de l'expression libre) et le catalogue des sujets."""
    with open(DATA_DIR / "expression_topic_texts.json", encoding="utf-8") as f:
        texts = json.load(f)
    with open(DATA_DIR / "revision_topics.json", encoding="utf-8") as f:
        catalogue = {t["id"]: t for t in json.load(f)["topics"]}
    return texts, catalogue


def concept_topic(concept: str) -> dict:
    """La tuile d'un concept au programme : libellé court, intitulé, règle et petit cours (à défaut, la règle)."""
    texts, catalogue = topic_texts()
    text = texts.get(f"expression:concept:{concept}", {})
    topic = catalogue.get(f"concept:{concept}", {})
    label = topic.get("label", concept)
    return {"short": text.get("short") or SHORT_TITLES.get(concept, label), "label": label,
            "rule": topic.get("rule", ""), "details": text.get("details") or topic.get("rule", label),
            "course": text.get("course")}


def availability(lesson: str) -> dict[str, int]:
    """Nombre d'exercices de chaque case au niveau lesson (cf. routers.revision_agent, /completion)."""
    items = candidates(lesson)
    return {"current": sum(i.concept == lesson for i in items), "previous": sum(i.concept != lesson for i in items)}


def complete(answer: str, prefix: str) -> str:
    """La phrase entière : l'élève peut ne dire que la suite (cf. demande explicite du user), le début est alors
    recollé devant."""
    said = [w for w in (letters(word) for word in answer.split()) if w]
    start = [w for w in (letters(word) for word in prefix.split()) if w]
    if not said or said[:len(start)] == start:
        return answer
    return f"{prefix} {answer}"


async def judge_completion(item: Item, sentence: str) -> dict:
    """Contrainte et plausibilité de la phrase de l'élève, jugées par le modèle rapide."""
    request = json.dumps({"debut": item.prefix, "contrainte": item.constraint, "concept": item.definition,
                          "action_reference": item.action, "phrase_eleve": sentence}, ensure_ascii=False)
    try:
        result = json.loads(await translate(request, COMPLETION_PROMPT, COMPLETION_SCHEMA, COMPLETION_MODEL))
    except Exception:
        log.exception("Jugement de la complétion impossible : %s", sentence)
        return {"contrainte_respectee": True, "texte_contrainte": "", "plausible": True, "texte_plausibilite": "",
                "problemes": []}
    log.info("complétion jugée : %s", result)
    return result


def bullet(text) -> str:
    """Un texte de puce, comme les autres : minuscule en tête, sans point final."""
    text = str(text or "").strip().rstrip(".")
    return text[:1].lower() + text[1:]


def dimensions(constraint_ok: bool, plausible: bool, judged: dict, language: list[dict]) -> list[dict]:
    """Les trois puces de l'évaluation (cf. demande explicite du user) : contrainte, plausibilité, grammaire."""
    faults = len(language)
    return [
        {"name": "Contrainte", "ok": constraint_ok, "text": bullet(judged.get("texte_contrainte"))
         or ("contrainte respectée" if constraint_ok else "contrainte non respectée")},
        {"name": "Plausibilité", "ok": plausible, "text": bullet(judged.get("texte_plausibilite"))
         or ("phrase plausible" if plausible else "phrase peu plausible")},
        {"name": "Grammaire", "ok": not faults, "text": "pas de faute de grammaire" if not faults else
         f"{faults} faute{'s' if faults > 1 else ''} de langue, surlignée{'s' if faults > 1 else ''} dans ta phrase"},
    ]


class CompletionSession(TeacherSession):
    def __init__(self, browser: WebSocket, voice: str, lesson: str, items: list[Item], concepts: list[str]):
        self.lesson = lesson
        self.items = items[:SENTENCES_PER_ROUND]
        self.concepts = concepts  # au programme : tous les concepts retenus par les cases cochées
        tools = [NEXT_SENTENCE_TOOL, COMPLETION_EVALUATION_TOOL, HESITATION_TOOL, RETRY_TOOL, LANGUAGE_TOOL]
        super().__init__(browser, GeminiLive(voice, prompts.completion_instructions(len(self.items)),
                                             f"{prompts.COMPLETION_START} {prompts.language_mode(LANGUAGE)}",
                                             tools))
        self.asked = 0  # phrases déjà servies
        # Un essai est attendu (phrase donnée, ou nouvel essai) ; hors de cette phase, c'est la conversation.
        self.answering = False
        self.evaluated = False  # la phrase en cours a déjà été évaluée une fois
        self.solved = False  # la phrase en cours est réussie : l'application enchaîne
        self.closing = False
        self.pending: list[dict] | None = None
        self.heard = ""  # transcription de ce que l'élève a dit depuis la phrase donnée
        self.language = LANGUAGE
        self.first_turn_done = False
        self.score = {"completion": {"ok": 0, "ko": 0}}
        self.score_events = 0
        self.finished = False
        self.advance_task: asyncio.Task | None = None
        self.intro_cut = False  # cf. declension.py
        # Phrase non évaluée par le prof (cf. declension.py) ; silence de l'élève (cf. HESITATION_SECONDS).
        self.attempt_at: float | None = None
        self.turn_started_at = 0.0
        self.nudged = 0
        self.given_at = 0.0  # moment où la phrase en cours a été servie
        self.spoke_at = 0.0  # dernière transcription de l'élève
        self.hint_at = 0.0  # dernier indice affiché
        self.hint = {"offered": False, "action": None, "prefix": None}
        self.answer_frame = False  # la fenêtre « Réponse » est apparue

    @property
    def current(self) -> Item | None:
        return self.items[self.asked - 1] if self.asked else None

    async def on_started(self) -> None:
        log.info("Séance « complétion » lancée · voix %s · leçon %s · %s", self.live.voice, self.lesson,
                 [(i.prefix, i.constraint, i.sentence) for i in self.items])
        await self.to_browser({"type": "language", "language": self.language})
        await self.to_browser({"type": "score", "score": self.score, "event": None})
        await self.send_topics()

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
        # Hésitation : la consigne est dite, le prof se tait, l'élève aussi depuis HESITATION_SECONDS (depuis la
        # consigne, sa dernière phrase ou le dernier indice).
        if (self.current and not self.solved and not self.closing and not self.hint["offered"]
                and self.attempt_at is None and self.turn_started_at > self.given_at and not self.turn.open
                and now - max(self.playback_until, self.spoke_at, self.hint_at) > HESITATION_SECONDS):
            if await self.offer_hint():
                log.info("l'élève hésite : indice offert")

    # --- indices --------------------------------------------------------------

    def next_hint(self) -> str | None:
        """Le prochain indice à offrir : l'action, puis le début prolongé (s'ils existent) ; None s'il n'y en a plus."""
        item = self.current
        if item and item.action and not self.hint["action"]:
            return "action"
        if item and item.longer and item.longer != item.prefix and not self.hint["prefix"]:
            return "prefix"
        return None

    async def offer_hint(self) -> bool:
        if self.next_hint() and not self.hint["offered"] and not self.finished:
            self.hint = {**self.hint, "offered": True}
            await self.to_browser({"type": "hint", "hint": self.hint})
            return True
        return False

    async def show_hint(self) -> None:
        kind = self.next_hint()
        if not self.hint["offered"] or kind is None:
            return
        item = self.current
        self.hint = {**self.hint, "offered": False, kind: item.action if kind == "action" else item.longer}
        log.info("indice affiché : %s", self.hint)
        self.hint_at = time.monotonic()
        if self.evaluated:
            # Après un échec, s'il hésite encore malgré l'indice, la pastille revient (cf. tick).
            self.attempt_at = None
        await self.to_browser({"type": "hint", "hint": self.hint})

    # --- programme et suivi ----------------------------------------------------

    async def send_topics(self) -> None:
        """Le programme : le concept de la phrase en cours en bleu, ceux des phrases déjà faites estompés."""
        current = self.current.concept if self.current and not self.finished else None
        covered = {item.concept for item in self.items[:max(self.asked - 1, 0)]}
        await self.to_browser({"type": "topics", "current": self.concepts.index(current) if current in self.concepts
                               else -1,
                               "covered": [i for i, concept in enumerate(self.concepts) if concept in covered],
                               "topics": [concept_topic(concept) for concept in self.concepts]})

    async def record(self, ok: bool) -> None:
        self.score["completion"]["ok" if ok else "ko"] += 1
        self.score_events += 1
        await self.to_browser({"type": "score", "score": self.score, "event": {
            "kind": "completion", "ok": ok, "question": self.asked, "seq": self.score_events}})

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
                    prompts.completion_not_evaluated(self.heard.strip()) if self.attempt_at is not None
                    else prompts.COMPLETION_STILL_ANSWERING)})
                return
            self.cancel_advance()
            await respond({"consigne": self.in_mode(await self.next_sentence())})
        elif name == COMPLETION_EVALUATION_TOOL["name"]:
            if self.current is None or self.solved:
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
            await respond({"consigne": self.in_mode(prompts.COMPLETION_HESITATION)})
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
        """Fautes de langue relevées par le prof, contrainte et plausibilité jugées par le modèle rapide ;
        l'évaluation s'affiche dans tous les cas (réussie : la phrase seule). Réussie, l'application enchaîne
        d'elle-même (cf. advance) ; ratée, la pastille offre l'indice suivant."""
        item = self.current
        answer = complete(hebrew_answer(args.get("reponse_eleve"), self.heard), item.prefix)
        language = [{"word": str(f.get("mot") or "").strip(), "kind": "language",
                     "comment": str(f.get("commentaire") or "").strip()}
                    for f in args.get("fautes_langue") or [] if isinstance(f, dict)]
        language = [e for e in language if e["word"] or e["comment"]]
        texts, judged = await asyncio.gather(french_texts([e["comment"] for e in language]),
                                             judge_completion(item, answer))
        for error, text in zip(language, texts):
            error["comment"] = text
        constraint_ok, plausible = bool(judged.get("contrainte_respectee")), bool(judged.get("plausible"))
        sense = []
        if not (constraint_ok and plausible):
            sense = [{"word": str(p.get("mot") or "").strip(), "kind": "sense",
                      "comment": str(p.get("commentaire") or "").strip()}
                     for p in judged.get("problemes") or [] if isinstance(p, dict)]
            sense = [p for p in sense if p["comment"]] or [
                {"word": "", "kind": "sense", "comment": "ta phrase ne respecte pas la consigne"}]
        errors = sense + language
        self.evaluated = True
        await self.to_browser({"type": "evaluation", "evaluation": {
            "answer": align_error_words(answer, errors), "errors": errors,
            "dimensions": dimensions(constraint_ok, plausible, judged, language)}})
        succeeded = not errors
        await self.record(succeeded)
        await self.set_answering(False)
        if succeeded:
            self.solved = True
            self.hint = {**self.hint, "offered": False}
            await self.to_browser({"type": "hint", "hint": self.hint})
        else:
            await self.offer_hint()
        await respond({"resultat": self.in_mode(prompts.COMPLETION_TASK_SUCCESS if succeeded
                                                else prompts.COMPLETION_FAILED)}, when_idle=True)
        if succeeded:
            self.cancel_advance()
            self.advance_task = asyncio.create_task(self.advance())
            self.background.append(self.advance_task)

    async def check_evaluated(self) -> None:
        """Le prof vient de répondre à une phrase en hébreu de l'élève sans l'évaluer : on le relance, une fois
        (cf. declension.py)."""
        if (self.answering and not self.evaluated and self.attempt_at is not None
                and self.turn_started_at > self.attempt_at and self.nudged != self.asked and not self.finished):
            self.nudged = self.asked
            log.info("phrase de l'élève non évaluée : relance du prof")
            await self.live.app_message(self.in_mode(prompts.completion_not_evaluated(self.heard.strip())))

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
        log.info("phrase %d/%d : %s … · %s · (%s)", self.asked, len(self.items), item.prefix, item.constraint,
                 item.sentence)
        self.evaluated = self.solved = False
        self.heard = ""
        self.attempt_at = None
        self.given_at = time.monotonic()
        self.hint_at = 0.0
        self.hint = {"offered": False, "action": None, "prefix": None}
        messages = [{"type": "hint", "hint": self.hint},
                    {"type": "exercise", "exercise": {"number": self.asked, "prefix": item.prefix,
                                                      "constraint": item.constraint}}]
        await self.send_topics()
        if self.closing:
            self.pending = messages
        else:
            for message in messages:
                await self.to_browser(message)
        await self.set_answering(True)
        return prompts.completion_exercise(self.asked, item.prefix, item.constraint)

    async def finish(self) -> None:
        if not self.finished:
            self.finished = True
            await self.set_answering(False)
            await self.to_browser({"type": "hint", "hint": {"offered": False, "action": None, "prefix": None}})
            await self.to_browser({"type": "phase", "phase": "done"})
            await self.send_topics()

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
        # « Complétion suivante » : après une évaluation, ou pour passer la phrase en cours.
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
            # Il prend la parole pour répondre : la fenêtre « Réponse » s'ouvre (cf. question.py).
            self.answer_frame = True
            await self.to_browser({"type": "answer_frame"})
        now = time.monotonic()
        self.spoke_at = now
        # Un essai : de l'hébreu dit pendant que le prof se tait (pas l'écho de sa voix).
        if self.answering and HEBREW_LETTER.search(text) and self.playback_until <= now:
            self.attempt_at = now
