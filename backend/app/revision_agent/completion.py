"""Tâche « Complétion » (cf. demande explicite du user), dans le gabarit de la question : l'application tire
SENTENCES_PER_ROUND débuts de phrase, chacun avec un concept des leçons cochées, et écrit au tableau le début de la
phrase et sa contrainte, en style télégraphique (« utilise la préposition de direction ל », cf.
scripts/build_revision_completion_constraints.py). L'élève complète la phrase à voix haute, librement : toute suite
plausible qui respecte la contrainte est juste. Le prof relève les fautes de langue, un modèle rapide juge la
contrainte et la plausibilité (cf. judges.judge_sentence). Réussie, l'application enchaîne d'elle-même ; ratée, le
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
import re
import time
from dataclasses import dataclass
from functools import lru_cache

from fastapi import WebSocket

from app.config import DATA_DIR
from app.revision_agent import completion_judges, prompts
from app.revision_agent.comprehension import LANGUAGE_TOOL, LANGUAGES
from app.revision_agent.config import DEFAULT_LANGUAGES
from app.revision_agent.evaluation import HEBREW_LETTER, align_error_words, hebrew_answer, letters
from app.revision_agent.expression import ANSWER, CLOSING_SECONDS, RETRY_TOOL, RETRY_VERDICT, TEACHER_IDLE_TIMEOUT
from app.revision_agent.gemini_live import GeminiLive, LiveEvent
from app.revision_agent.intros import CONGRATULATIONS_TEXTS
from app.revision_agent.judges import (error_list, judge_sentence, mispronounced, no_fault, plausibility, sense_errors,
                                       teacher_errors)
from app.revision_agent.passages import is_previous, lesson_number
from app.revision_agent.schema import (NO_RESPELL, app_message, as_json, farewell, pronunciation_judge, step, teacher,
                                       teacher_voice, transcription, welcome)
from app.revision_agent.transcribe import TEACHER_CONTEXT
from app.revision_agent.session import TeacherSession
from app.revision_agent.utterances import lesson_utterances, sentence_key

log = logging.getLogger("revision_agent.completion")

SENTENCES_PER_ROUND = 6  # comme la question (cf. demande explicite du user)
CURRENT_LESSON_SENTENCES = 2  # phrases du concept de la leçon en cours quand les leçons antérieures sont aussi cochées
HESITATION_SECONDS = 5  # silence de l'élève au-delà duquel la pastille de l'indice apparaît
TEACHER_START_TIMEOUT = 4  # après une réussite, délai laissé au prof pour commencer à féliciter l'élève
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

# Contrainte et plausibilité, jugées à part (cf. judges.judge_sentence, demande explicite du user).
COMPLETION_EXERCISE = ("Exercice de complétion pour débutants : l'élève voit le début d'une phrase hébraïque (debut) et "
                       "une contrainte de grammaire (contrainte, qui fait pratiquer concept), et complète la phrase à "
                       "voix haute, librement. action_reference est l'action de la phrase d'origine, une simple "
                       "référence : l'élève n'est pas tenu de la suivre.")
COMPLETION_CRITERIA = {
    "contrainte": "la suite de l'élève emploie bien l'outil de grammaire demandé, de la façon demandée (« exprime une "
                  "absence avec אין + ל » : une possession avec יש est fausse ; « utilise la préposition de direction "
                  "ל » : une destination sans ל, ou avec ב, est fausse). Une forme mal accordée ou mal déclinée de cet "
                  "outil reste une faute de langue, pas un manquement à la contrainte.",
    "plausibilite": plausibility(" entière, début compris", "« דוד נוסע לשולחן » ne l'est pas. Une suite très "
                                                             "différente de l'action de référence est juste."),
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
    """Un exercice par concept de l'énoncé vu au niveau level ou dans les leçons antérieures (cf. passages.is_previous),
    s'il a une contrainte et un début à afficher (concept en tout début de phrase : écarté, cf. demande explicite du
    user)."""
    items = []
    for c in u["concepts"]:
        concept = lesson_number(c["id"])
        prefix = (c.get("truncated_one") or "").strip()
        if concept is not None and (concept == level or is_previous(concept, level)) and c.get("constraint") and HEBREW_LETTER.search(prefix):
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


def own(item: Item, lesson: str) -> bool:
    """Le concept de l'exercice est celui de la leçon (« 0.33 », ou l'une de ses parties « 0.33a », « 0.33b »)."""
    return lesson_number(item.concept) == lesson_number(lesson)


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
    mine = rotate([i for i in items if own(i, lesson)], seen) if current else []
    older = rotate([i for i in items if not own(i, lesson)], seen) if previous else []
    if not (mine and older):
        return mine or older
    count = max(min(CURRENT_LESSON_SENTENCES, len(mine)), SENTENCES_PER_ROUND - len(older))
    session = mine[:count] + older[:SENTENCES_PER_ROUND - count]
    random.shuffle(session)
    return session + mine[count:] + older[SENTENCES_PER_ROUND - count:]


def qualified_concepts(lesson: str, current: bool, previous: bool) -> list[str]:
    """Les concepts retenus par les cases cochées (ceux qui ont au moins un exercice), dans l'ordre des leçons."""
    concepts = {i.concept for i in candidates(lesson)
                if (current and own(i, lesson)) or (previous and not own(i, lesson))}
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
    return {"current": sum(own(i, lesson) for i in items), "previous": sum(not own(i, lesson) for i in items)}


def complete(answer: str, prefix: str) -> str:
    """La phrase entière : l'élève peut ne dire que la suite (cf. demande explicite du user), le début est alors
    recollé devant."""
    said = [w for w in (letters(word) for word in answer.split()) if w]
    start = [w for w in (letters(word) for word in prefix.split()) if w]
    if not said or said[:len(start)] == start:
        return answer
    return f"{prefix} {answer}"


async def judge_completion(item: Item, sentence: str) -> dict:
    """Contrainte et plausibilité de la phrase de l'élève (cf. judges.judge_sentence)."""
    return await judge_sentence(COMPLETION_EXERCISE, {"debut": item.prefix, "contrainte": item.constraint,
                                                      "concept": item.definition, "action_reference": item.action},
                                sentence, COMPLETION_CRITERIA)


def bullet(text) -> str:
    """Un texte de puce, comme les autres : minuscule en tête, sans point final."""
    text = str(text or "").strip().rstrip(".")
    return text[:1].lower() + text[1:]


def dimensions(judged: dict, language: list[dict]) -> list[dict]:
    """Les trois puces de l'évaluation (cf. demande explicite du user) : contrainte, plausibilité, grammaire."""
    faults = len(language)
    constraint_ok, plausible = judged["contrainte"]["ok"], judged["plausibilite"]["ok"]
    return [
        {"name": "Contrainte", "ok": constraint_ok, "text": bullet(judged["contrainte"]["texte"])
         or ("contrainte respectée" if constraint_ok else "contrainte non respectée")},
        {"name": "Plausibilité", "ok": plausible, "text": bullet(judged["plausibilite"]["texte"])
         or ("phrase plausible" if plausible else "phrase peu plausible")},
        {"name": "Grammaire", "ok": not faults, "text": "pas de faute de grammaire" if not faults else
         f"{faults} faute{'s' if faults > 1 else ''} de langue, surlignée{'s' if faults > 1 else ''} dans ta phrase"},
    ]


# Tri de la page texte (cf. demande explicite du user) : la suite est libre, ses mots ne sont dans aucune phrase de
# référence (le tri des autres tâches, cf. reading.to_teacher, la prendrait pour une question). Une réplique est donc
# un essai, sauf si elle n'a aucun mot hébreu, si elle a au moins autant de mots en lettres latines (du français) que
# de mots hébreux, au moins QUESTION_LATIN_WORDS, ou si c'est une question en hébreu (QUESTION_WORDS en tête, « ? » à
# la fin) qui ne reprend pas le début affiché. Dans le doute, un essai.
QUESTION_LATIN_WORDS = 2
QUESTION_WORDS = ("מה", "למה", "איך", "מי", "איפה", "מתי", "האם", "כמה", "מאיפה", "לאן")
LATIN_WORD = re.compile(r"[A-Za-zÀ-ÿ]{2,}")


def hebrew_words(text: str) -> list[str]:
    return [w for w in (letters(token) for token in text.split()) if w]


def is_attempt(text: str, prefix: str) -> bool:
    """La réplique est-elle une phrase de l'élève (un essai), ou adressée au prof ? (cf. QUESTION_LATIN_WORDS)"""
    said, start = hebrew_words(text), hebrew_words(prefix)
    if not said:
        return False
    if start and said[:len(start)] == start:
        return True
    latin = LATIN_WORD.findall(text)
    if len(latin) >= QUESTION_LATIN_WORDS and len(latin) >= len(said):
        return False
    return not (said[0] in QUESTION_WORDS and text.strip().endswith("?"))


def schema(config: str = "sharp") -> dict:
    """Le schéma de la tâche (cf. schema.py), page texte, config SHARP (« sharp ») ou SHARP wo prononciation
    (« sharp_wo_pronunciation » : ni phonétique ni juge de prononciation), sur un exemple : le début « אנחנו נוסעות »
    (leçon 0.04), la contrainte de la préposition de direction ל, et une phrase avec une faute de grammaire (אוכל) et,
    en SHARP, une faute de prononciation (חיפה)."""
    pronunciation = config != "sharp_wo_pronunciation"
    language = "he"  # sans mode de langue
    item = Item("0.04", "0.07", "אנחנו נוסעות לפריז.", "אנחנו נוסעות", "אנחנו נוסעות ל",
                "utilise la préposition de direction ל", "se rendre quelque part",
                "La préposition de direction ל après un verbe de mouvement")
    inputs = {"debut": item.prefix, "contrainte": item.constraint, "concept": item.definition,
              "action_reference": item.action}
    heard = "אנחנו נוסעות לחיפה ואנחנו אוכל שם"
    phonetic = "anakhnu nos'ot le-hifa ve-anakhnu okhel sham"
    instruction = "יאללה, נתחיל! הנה התחלה של משפט: אנחנו נוסעות... תשלים איך שאתה רוצה, לפי ההוראה."
    instructions = prompts.without_language_mode(prompts.completion_text_instructions(SENTENCES_PER_ROUND))
    exercise = prompts.completion_text_exercise(1, item.prefix, item.constraint)
    second = prompts.completion_text_exercise(2, "יש לי", "ajoute un complément d'objet direct défini précédé de את")
    ok = {"ok": True, "commentaire": "", "resume": ""}
    grammar = {"ok": False, "fautes": [{"mot": "אוכל", "commentaire": "Ce verbe ne s'accorde pas avec אנחנו, au "
                                                                     "féminin pluriel."}],
               "resume": "שים לב לפועל השני, הוא לא מתאים לאנחנו."}
    words = [{"mot": mot, "correct": correct, "entendu": entendu, "faute": faute, "remarque": False,
              **({"commentaire": "Le ח se prononce kh, pas h."} if faute else {})}
             for mot, correct, entendu, faute in [
                 ("אנחנו", "anakhnu", "anakhnu", False), ("נוסעות", "nos'ot", "nos'ot", False),
                 ("לחיפה", "le-kheifa", "le-hifa", True), ("ואנחנו", "ve-anakhnu", "ve-anakhnu", False),
                 ("אוכל", "okhel", "okhel", False), ("שם", "sham", "sham", False)]]
    found = [w for w in words if w["faute"]]
    first = {"contrainte": ok, "plausibilite": ok, "grammaire": {**grammar, "commentaire": ""}}
    early = completion_judges.aggregate(first)
    full = completion_judges.aggregate({**first, "prononciation": completion_judges.pronunciation_verdict(found)})
    shown = full if pronunciation else early
    congratulations = "\n".join(f"{entry['text']} · {entry['french']}" for entry in CONGRATULATIONS_TEXTS)
    # La réponse orale en texte, sans relecture de l'orthographe ; sans prononciation, la transcription seule (pas de
    # 4b).
    spoken = transcription(heard, heard, phonetic, instruction, TEACHER_CONTEXT, role="4", respell=False)
    if not pronunciation:
        spoken = spoken[:1]

    def judge_step(name: str, role: str, title: str, output: dict) -> dict:
        prompt, _, model, _ = completion_judges.JUDGES[name]
        return step("model", role, model=model, source="completion_judges.judge", title=title,
                    system=prompt, message=completion_judges.judge_request(inputs, heard), output=as_json(output))

    judges = [
        [judge_step("contrainte", "6a · Juge de la contrainte", "La contrainte est-elle respectée ?", ok)],
        [judge_step("grammaire", "6b · Juge de la grammaire", "Fautes de langue, mot par mot", grammar)],
        [judge_step("plausibilite", "6c · Juge de la plausibilité", "La phrase a-t-elle un sens ?", ok)],
    ]
    if pronunciation:
        judges.append([pronunciation_judge("6d · Juge de prononciation", heard, phonetic, words,
                                           what="Les mots sont-ils bien prononcés ? Compare la phonétique entendue (4b) "
                                                "à la prononciation correcte de la transcription. Seules les fautes "
                                                "comptent : les remarques vertes ne s'affichent pas.")])
    if pronunciation:
        aggregation = ("affichage en deux temps : si la contrainte, la grammaire ou la plausibilité est fausse, "
                       "l'évaluation s'affiche et le prof parle sans attendre la prononciation, dont les fautes "
                       "s'ajoutent à l'écran à leur arrivée (le prof n'en parle pas) ; les trois bonnes, on l'attend",
                       "prononciation en faute : la réplique est un modèle du code, avec le premier mot fautif : "
                       f"« {completion_judges.PRONUNCIATION_SUMMARY} »")
        verdicts = (("Les trois premiers verdicts réunis (exemple)", as_json(early)),
                    ("Puis, la prononciation arrivée (exemple)", as_json(full)))
    else:
        aggregation = ()
        verdicts = (("Les verdicts réunis (exemple)", as_json(early)),)
    order = "contrainte, grammaire, plausibilité" + (", prononciation" if pronunciation else "")
    return {
        "title": "Complétion · SHARP" + ("" if pronunciation else " wo prononciation"),
        "intro": "L'élève voit le début d'une phrase hébraïque et une contrainte de grammaire, en français, et complète "
                 "la phrase comme il veut : toute suite qui respecte la contrainte et a du sens est juste. Mode texte, "
                 f"{SENTENCES_PER_ROUND} phrases par séance. L'application tire les phrases, trie chaque réplique de "
                 f"l'élève, et juge elle-même chaque phrase : {len(judges)} juges en parallèle ({order}), réunis par "
                 "le code, qui choisit la réplique du prof. Le prof accueille, donne les consignes et répond aux "
                 "questions." + ("" if pronunciation else " Ni transcription phonétique ni juge de prononciation."),
        "flow": [
            *([[[recorded]]] if (recorded := welcome("completion", language)) else []),
            [[step("code", "1 · Les phrases", source="completion.draw_items · rotate",
                   title="L'application tire les phrases",
                   text=f"{SENTENCES_PER_ROUND} phrases des leçons déjà vues, chacune avec un concept déjà vu au "
                        "niveau choisi, son début à afficher et sa contrainte (préparés d'avance, cf. "
                        "scripts/build_revision_completion_constraints.py).",
                   items=("les concepts en alternance : un concept après l'autre, en tournant, pour la variété",
                          "jamais deux fois la même phrase, ni une simple variante",
                          "seulement les leçons cochées : la leçon en cours, les leçons antérieures, ou les deux "
                          f"(alors {CURRENT_LESSON_SENTENCES} phrases du concept de la leçon en cours)",
                          "la phrase d'origine n'est jamais affichée : elle ne sert qu'aux indices"),
                   hint="À droite : le programme de la séance (un concept par tuile, avec son petit cours) et le "
                        "suivi.")]],
            [[step("code", "2 · La phrase s'affiche", source="CompletionSession.next_sentence · phrase_suivante",
                   title="Le début et la contrainte au tableau, le prof donne la consigne",
                   text="La première, le prof la demande (phrase_suivante) ; les suivantes viennent de l'application "
                        "après une réussite, ou du bouton « Complétion suivante ».",
                   items=("consigne en hébreu, sans jamais proposer de suite",
                          "première phrase : le prof explique la consigne en une ou deux phrases",
                          "les suivantes : quelques mots seulement, sans réexpliquer, une tournure différente",
                          "indices, à la demande : l'action de la phrase, puis le début prolongé ; la pastille les "
                          f"offre après une phrase ratée, ou {HESITATION_SECONDS} s de silence"),
                   parts=(("La fonction phrase_suivante", as_json(NEXT_SENTENCE_TOOL)),
                          ("Réponse de l'application au prof (première phrase)", as_json({"consigne": exercise})),
                          ("Phrase suivante, après une réussite (exemple)",
                           app_message(f"{prompts.NEXT_SENTENCE_AFTER_SUCCESS} {second}")),
                          ("Consigne du prof (exemple)", instruction)))]],
            [[step("student", "3 · L'élève", title="Complète la phrase, ou parle au prof",
                   text="Touche le bouton rond, puis, à « Parlez », dit sa phrase (toute la phrase, ou seulement la "
                        "suite : le code recolle le début) ; touche le carré pour envoyer. Il peut aussi l'écrire, ou "
                        "corriger la transcription au crayon et la renvoyer.")]],
            spoken,
            [[step("code", "5 · Tri : une phrase, ou une question au prof ?", source="completion.is_attempt",
                   title="Le code décide",
                   text="La suite est libre : ses mots ne sont dans aucune phrase de référence, le tri des autres "
                        "tâches ne s'applique pas. La réplique est une phrase de l'élève, sauf :",
                   items=("aucun mot hébreu",
                          f"au moins {QUESTION_LATIN_WORDS} mots en lettres latines (du français), et au moins autant "
                          "que de mots hébreux",
                          "une question en hébreu (מה, למה, איך… en tête, « ? » à la fin), qui ne reprend pas le "
                          "début affiché"),
                   hint="Elle reprend le début affiché : toujours une phrase. Dans le doute, une phrase. Adressée au "
                        "prof : il y répond en français, sans donner de suite.",
                   parts=(("Note au prof : adressée au prof", prompts.COMPLETION_ADDRESSED),))]],
            judges,
            [[step("code", "7 · Le code réunit les verdicts", source="completion_judges.aggregate",
                   title="Le verdict de l'application, et la réplique du prof",
                   text="Réussie seulement si tous les juges sont bons. Sinon, toutes les fautes s'affichent, et la "
                        "réplique du prof est la phrase de résumé du premier juge en faute, dans cet ordre : "
                        f"{order}.",
                   items=aggregation + (
                       "fenêtre de la réponse : la phrase de l'élève, déjà écrite, ses mots fautifs surlignés et "
                       "commentés, et les puces (" + ", ".join(d["name"] for d in shown["dimensions"]) + ")",
                       "suivi de la séance : phrase réussie ou ratée"),
                   parts=verdicts)]],
            [[step("bad", "8a · Phrase ratée", source="CompletionSession · TextTeacher.say",
                   text="La phrase de résumé du juge choisi est dite à la place du prof, et gardée dans son "
                        "historique. C'est la conversation : l'élève redonne sa phrase (de nouveau triée, puis "
                        "jugée), pose une question au prof, demande un indice, ou passe à la suite.",
                   hint="Le bouton « Complétion suivante », ou la demande au prof (phrase_suivante), passe à la "
                        "phrase suivante.",
                   output=shown["summary"])],
             [step("good", "8b · Phrase réussie", source="intros.CONGRATULATIONS_TEXTS · advance",
                   text="Une félicitation en hébreu, tirée au hasard, jouée à la place du prof : sa voix enregistrée "
                        "d'avance, son verbatim et sa traduction affichés ; la phrase de l'élève, soulignée en vert et "
                        "cochée, s'efface ; puis l'application envoie la phrase suivante au prof.",
                   hint="Retour à l'étape 2. Après la dernière phrase, l'au revoir.",
                   parts=(("Les félicitations (les mêmes qu'en déclinaison)", congratulations),))]],
            [[farewell(f"9 · Au revoir (après la phrase {SENTENCES_PER_ROUND})", language)]],
        ],
        "notes": [
            NO_RESPELL,
            teacher(instructions, prompts.COMPLETION_START,
                    "Accueil, consigne de chaque phrase, et réponses aux questions de l'élève. Il ne juge aucune "
                    "phrase et ne choisit pas les phrases ; seule fonction : phrase_suivante.",
                    "completion", language, phonetic=False),
            *teacher_voice("שים לב לפועל השני, הוא לא מתאים לאנחנו.",
                           "Attention au second verbe, il ne va pas avec « nous ».",
                           "Ici, la préposition ל indique où l'on va.",
                           {"francais": "Ici, la préposition ל indique où l'on va.",
                            "hebreu": "כאן מילת היחס ל מראה לאן הולכים."}),
            "Langue (page texte, sans mode de langue) : le prof répond en français à une réplique que l'élève lui "
            "adresse, les mots hébreux cités en lettres hébraïques, sans traduction en hébreu à l'affichage ; en "
            "hébreu à tout le reste (accueil, consignes, au revoir), comme les répliques de l'application "
            "(félicitations, phrases de résumé des juges, sans nikkoud). Sous chaque réplique en hébreu, sa "
            "traduction française. Les commentaires écrits des fautes, en français, mots hébreux en lettres "
            "hébraïques.",
            "Deux configs : SHARP (avec la prononciation : phonétique 4b et juge 6d, comme en lecture) et SHARP wo "
            "prononciation (sans eux).",
            f"Les messages affichés sont ceux d'un exemple : le début « {item.prefix} » (leçon {item.lesson}), la "
            f"contrainte « {item.constraint} », et la phrase « {heard} ». Les instructions système sont celles du "
            "code actuel.",
        ],
    }


class CompletionSession(TeacherSession):
    def __init__(self, browser: WebSocket, voice: str, lesson: str, items: list[Item], concepts: list[str]):
        self.lesson = lesson
        self.items = items[:SENTENCES_PER_ROUND]
        self.concepts = concepts  # au programme : tous les concepts retenus par les cases cochées
        tools = [NEXT_SENTENCE_TOOL, COMPLETION_EVALUATION_TOOL, HESITATION_TOOL, RETRY_TOOL, LANGUAGE_TOOL]
        super().__init__(browser, GeminiLive(voice, prompts.completion_instructions(len(self.items)),
                                             f"{prompts.COMPLETION_START} {prompts.language_mode(DEFAULT_LANGUAGES["completion"])}",
                                             tools))
        self.asked = 0  # phrases déjà servies
        # Un essai est attendu (phrase donnée, ou nouvel essai) ; hors de cette phase, c'est la conversation.
        self.answering = False
        self.evaluated = False  # la phrase en cours a déjà été évaluée une fois
        self.solved = False  # la phrase en cours est réussie : l'application enchaîne
        self.closing = False
        self.pending: list[dict] | None = None
        self.heard = ""  # transcription de ce que l'élève a dit depuis la phrase donnée
        self.language = DEFAULT_LANGUAGES["completion"]
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
        # Page texte (cf. judge_by_app) : l'application trie et juge les phrases de l'élève, et y répond.
        self.app_judges = False
        self.language_modes = True
        self.judging = False
        self.attempts = 0  # phrases jugées : la prononciation arrivée en retard ne vaut que pour la dernière
        # Ses félicitations, voix comprise (cf. intros.congratulations), données par le routeur ; dites à la volée sinon.
        self.congratulations: list[dict] = [{**entry, "pcm": None} for entry in CONGRATULATIONS_TEXTS]

    @property
    def current(self) -> Item | None:
        return self.items[self.asked - 1] if self.asked else None

    async def on_started(self) -> None:
        log.info("Séance « complétion » lancée · voix %s · leçon %s · %s", self.live.voice, self.lesson,
                 [(i.prefix, i.constraint, i.sentence) for i in self.items])
        if self.language_modes:
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
        if event.kind == "turn_complete" and not self.app_judges:
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
        language, judged, pronunciation = await asyncio.gather(
            teacher_errors(args, {"fautes_langue": "language"}), judge_completion(item, answer),
            self.pronunciation_errors())
        errors = sense_errors(judged, "ta phrase ne respecte pas la consigne") + language + pronunciation
        await self.tell_judged(errors)
        self.evaluated = True
        await self.to_browser({"type": "evaluation", "evaluation": {
            "answer": align_error_words(answer, errors), "errors": errors,
            "dimensions": dimensions(judged, language)}})
        succeeded = no_fault(errors)
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
        if self.app_judges:
            return prompts.completion_text_exercise(self.asked, item.prefix, item.constraint)
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
            if data["language"] != self.language and self.language_modes:
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
        # Sans mode de langue (page texte, cf. language_modes) : le message seul.
        return f"{message} {prompts.language_mode(self.language)}" if self.language_modes else message

    # --- page texte : l'application trie, juge et répond -----------------------

    def judge_by_app(self, instructions: str) -> None:
        """Page texte (cf. demande explicite du user) : plus de mode de langue, ni de relecture de l'orthographe ;
        l'application trie chaque réplique de l'élève (phrase, ou adressée au prof, cf. is_attempt) et juge elle-même
        les phrases (cf. completion_judges) ; le prof (instructions, sans mode de langue) n'évalue plus rien."""
        self.app_judges, self.language_modes, self.language = True, False, "he"
        self.respell_spoken = False
        self.live.instructions = instructions
        self.live.start_message = prompts.COMPLETION_START
        self.live.tools = [NEXT_SENTENCE_TOOL]

    async def on_student_text(self, text: str, spoken: bool = False, corrected: bool = False) -> None:
        if (not self.app_judges or not text or self.started_at is None or self.current is None or self.finished
                or self.closing or self.judging):
            await super().on_student_text(text, spoken, corrected)
            return
        attempt = is_attempt(text, self.current.prefix)
        log.info("tri : %s", "phrase de l'élève" if attempt else "adressée au prof")
        if not attempt:
            self.audio_phonetic = ""  # une question : sa prononciation n'est pas jugée
            await self.live.note(prompts.COMPLETION_ADDRESSED)
            await super().on_student_text(text, spoken, corrected)
            return
        self.judging = True
        try:
            await self.judge(text, spoken, corrected)
        finally:
            self.judging = False

    async def judge(self, text: str, spoken: bool, corrected: bool) -> None:
        """La phrase de l'élève jugée par les quatre juges en parallèle, réunis par le code (cf. completion_judges) :
        réussie, une félicitation enregistrée, puis la phrase suivante ; ratée, la phrase de résumé du juge le plus
        prioritaire, puis la conversation. La prononciation n'est attendue que si les trois autres juges sont bons ;
        sinon ses fautes s'ajoutent à l'écran à leur arrivée (cf. late_pronunciation)."""
        await self.on_event(LiveEvent("user_text", f"{text} "))
        phonetic = self.audio_phonetic if spoken else ""
        self.audio_phonetic = ""
        await self.live.student_text(text, spoken, corrected, respond=False)
        self.cancel_advance()
        self.attempts += 1
        item, attempt = self.current, self.attempts
        sentence = complete(text, item.prefix)
        inputs = {"debut": item.prefix, "contrainte": item.constraint, "concept": item.definition,
                  "action_reference": item.action}
        names = ("contrainte", "grammaire", "plausibilite")
        pronunciation = (asyncio.create_task(mispronounced(text, phonetic, self.pronunciation_model))
                         if phonetic and self.pronunciation_model else None)
        if pronunciation:
            self.background.append(pronunciation)
        verdicts = dict(zip(names, await asyncio.gather(*(completion_judges.judge(name, inputs, sentence)
                                                          for name in names))))
        if pronunciation and completion_judges.aggregate(verdicts)["ok"]:
            verdicts["prononciation"] = completion_judges.pronunciation_verdict(await pronunciation)
            pronunciation = None
        result = completion_judges.aggregate(verdicts)
        self.evaluated = True
        await self.show_evaluation(text, result)
        succeeded = result["ok"]
        await self.record(succeeded)
        await self.set_answering(False)
        if succeeded:
            self.solved = True
            self.hint = {**self.hint, "offered": False}
            await self.to_browser({"type": "hint", "hint": self.hint})
            await self.say(random.choice(self.congratulations))
            # La phrase suivante, dès la félicitation dite (cf. advance).
            self.advance_task = asyncio.create_task(self.advance())
            self.background.append(self.advance_task)
            return
        await self.offer_hint()
        if pronunciation:
            self.background.append(asyncio.create_task(self.late_pronunciation(pronunciation, verdicts, text,
                                                                               attempt)))
        await self.say({"text": result["summary"] or prompts.COMPLETION_FAILED_REPLY})

    async def late_pronunciation(self, pronunciation: asyncio.Task, verdicts: dict, text: str, attempt: int) -> None:
        """Affichage en deux temps (cf. demande explicite du user) : les fautes de prononciation, arrivées après le
        verdict, s'ajoutent à l'évaluation affichée ; le prof n'en parle pas. Rien si l'élève est passé à une autre
        phrase ou à un autre essai entre-temps."""
        found = await pronunciation
        if attempt != self.attempts or self.closing or self.finished:
            return
        result = completion_judges.aggregate({**verdicts,
                                              "prononciation": completion_judges.pronunciation_verdict(found)})
        log.info("prononciation arrivée après le verdict : %s", result["dimensions"][-1])
        await self.show_evaluation(text, result)

    async def show_evaluation(self, text: str, result: dict) -> None:
        """L'évaluation dans la fenêtre de la réponse, sur le verbatim déjà écrit (cf. StudentAnswer), comme en
        compréhension et en déclinaison : fautes surlignées et commentées, puis les puces."""
        await self.to_browser({"type": "exchange", "kind": "evaluation", "evaluation": {
            "answer": align_error_words(text.strip(), result["errors"]), "errors": result["errors"],
            "dimensions": result["dimensions"]}})

    async def say(self, entry: dict) -> None:
        """Une réplique de l'application ({"text"}, et pour une félicitation sa traduction et sa voix enregistrée),
        dite à la place du prof et gardée dans son historique (cf. TextTeacher.say)."""
        if entry.get("french"):
            self.known_translations[entry["text"]] = entry
        await self.live.say({"text": entry["text"], "pcm": entry.get("pcm")})

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
