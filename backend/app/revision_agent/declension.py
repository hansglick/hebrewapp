"""Tâche « Déclinaison » (cf. demande explicite du user) : comme la déclinaison de l'expression libre, mais sur des
phrases du cours. L'application tire SENTENCES_PER_ROUND phrases dans les sujets de déclinaison du niveau choisi
(conjugaisons et ל décliné, cf. revision_topics.json), chacune avec son élément à décliner connu d'avance (sujet ou
préposition déclinée, cf. revision_course.json) ; sentence_declension.prepare choisit la personne cible, parmi celles
qui obligent à un accord, et écrit la phrase attendue. Le prof donne la consigne, l'élève redit la phrase déclinée, le
prof l'évalue sans donner la solution. Réussie, le prof enchaîne de lui-même sur la phrase suivante ; ratée, il
commente et l'élève retente de vive voix ou passe avec « Question suivante ».

À droite, comme en expression libre : le programme de la séance (un sujet par tuile, avec son petit cours, cf.
expression_topic_texts.json) et le suivi.

Messages propres à la tâche (backend → navigateur, en plus de ceux de session.py) :
  {"type": "topics", ...}                               (cf. expression.py)
  {"type": "declension", "declension": {"number": int, "sentence", "span", "replacement", "kind"} | null}
  {"type": "declension_evaluation", "evaluation": {"answer", "errors"} | null}
  {"type": "closing"}, {"type": "score", ...}, {"type": "answering", ...}, {"type": "language", ...},
  {"type": "first_turn_done"}, {"type": "phase", "phase": "done"}   (cf. expression.py)
Navigateur → backend : {"type": "next"}, {"type": "language", "language": "he" | "fr"}.
"""

import asyncio
import json
import logging
import random
import time
from dataclasses import dataclass
from functools import cache

from fastapi import WebSocket

from app.config import DATA_DIR
from app.revision_agent import prompts, sentence_declension
from app.revision_agent.comprehension import LANGUAGE_TOOL, LANGUAGES
from app.revision_agent.config import (DECLENSION_JUDGE_MODEL, DECLENSION_MODEL, DEFAULT_LANGUAGES,
                                      SHOW_DECLENSION_EXPECTED)
from app.revision_agent.evaluation import HEBREW_LETTER, align_error_words, hebrew_answer
from app.revision_agent.expression import (CLOSING_SECONDS, DECLENSION_EVALUATION_TOOL, RETRY_TOOL,
                                          TEACHER_IDLE_TIMEOUT)
from app.revision_agent.gemini_live import GeminiLive, LiveEvent
from app.revision_agent.intros import CONGRATULATIONS_TEXTS
from app.revision_agent.judges import faults, teacher_errors
from app.revision_agent.passages import is_previous, lesson_number
from app.revision_agent.schema import (NO_RESPELL, app_message, as_json, farewell, step, teacher, teacher_voice,
                                       transcription, welcome)
from app.revision_agent.transcribe import TEACHER_CONTEXT
from app.revision_agent.session import TeacherSession
from app.revision_agent.utterances import sentence_key, word_span

log = logging.getLogger("revision_agent.declension")

TEACHER_START_TIMEOUT = 4  # après une réussite, délai laissé au prof pour commencer à féliciter l'élève

SENTENCES_PER_ROUND = 6  # cf. demande explicite du user
# Sujets qu'on ne décline pas : interrogatifs, lieux, quantités indéfinies.
NO_SUBJECT_CHANGE = {"מי", "כולם", "פריז", "ירושלים", "כמה תלמידים"}

NEXT_SENTENCE_TOOL = {
    "name": "phrase_suivante",
    "description": "Passe à la phrase suivante : ferme les fenêtres de la phrase en cours, affiche la nouvelle à "
                   "l'écran de l'élève et te renvoie l'exercice (phrase, élément à remplacer, ce qu'il devient, "
                   "phrase attendue, à ne jamais dire).",
    # Bloquante : le prof attend l'exercice avant de donner la consigne.
}


@dataclass
class Item:
    topic: dict  # sujet du programme (id, label, rule, short, details, course)
    lesson: str
    sentence: str  # sans nikkoud
    element: sentence_declension.Element


@cache
def course_texts() -> dict:
    with open(DATA_DIR / "expression_topic_texts.json", encoding="utf-8") as f:
        return json.load(f)


@cache
def course_phrases() -> dict:
    with open(DATA_DIR / "revision_course.json", encoding="utf-8") as f:
        return json.load(f)["phrases"]


def utterance_text(exercise: dict, kind: str, word: str) -> str:
    """L'énoncé de la phrase qui porte l'élément (une phrase du cours peut en compter plusieurs), sinon la phrase."""
    field = "subjects" if kind == "subject" else "declined_prepositions"
    for u in course_phrases().get(exercise["phrase_id"], {}).get("utterances", []):
        if any(e["he"] == word for e in u.get(field) or []) and word_span(u["he"], word):
            return u["he"]
    return exercise["text"]


def round_topics(lesson: str) -> list[tuple[dict, list[Item]]]:
    """Sujets de déclinaison du niveau (une famille de racines du פעל par sujet, comme en expression libre), chacun
    avec ses phrases des leçons jusqu'au niveau."""
    level = lesson_number(lesson)
    if level is None:
        return []
    with open(DATA_DIR / "revision_topics.json", encoding="utf-8") as f:
        catalogue = json.load(f)["topics"]
    texts = course_texts()
    result = []
    for topic in catalogue:
        if topic["type"] not in ("conjugaison", "preposition") or lesson_number(topic["introduced_in"]) > level:
            continue
        # Libellé court, description et cours : ceux du même sujet en expression libre.
        text = texts.get(f"expression:{topic['id']}", {})
        shown = {"id": topic["id"], "label": topic["label"], "rule": topic["rule"],
                 "short": text.get("short", topic["label"]), "details": text.get("details", topic["rule"]),
                 "course": text.get("course")}
        items = []
        for exercise in topic["exercises"]:
            n = lesson_number(exercise["lesson"])
            if n is None or n > level:
                continue
            kind = "preposition" if exercise.get("preposition") else "subject"
            data = exercise.get(kind)
            if not data or data["he"] in NO_SUBJECT_CHANGE:
                continue
            element = sentence_declension.Element.from_data(kind, data)
            sentence = sentence_declension.NIKKUD.sub("", utterance_text(exercise, kind, data["he"])).strip()
            if word_span(sentence, element.word):
                items.append(Item(shown, exercise["lesson"], sentence, element))
        if items:
            result.append((shown, items))
    return result


CURRENT_LESSON_SENTENCES = 2  # phrases de la leçon en cours quand les leçons antérieures sont aussi cochées


def rotate(lesson: str, keep, seen: set[tuple[str, ...]]) -> list[Item]:
    """Les phrases retenues par keep, un sujet après l'autre, en tournant (tous les sujets avant d'en reprendre un),
    jamais deux fois la même phrase, ni une simple variante (cf. sentence_key ; seen : les phrases déjà prises)."""
    pools = []
    for _, items in round_topics(lesson):
        mine = [item for item in items if keep(item)]
        if mine:
            pools.append(random.sample(mine, len(mine)))
    random.shuffle(pools)
    drawn = []
    while any(pools):
        for pool in pools:
            while pool:
                item = pool.pop(0)
                if sentence_key(item.sentence) not in seen:
                    seen.add(sentence_key(item.sentence))
                    drawn.append(item)
                    break
    return drawn


def draw_items(lesson: str, current: bool, previous: bool) -> list[Item]:
    """Toutes les phrases possibles, dans l'ordre du tirage, les sujets variés le plus possible (cf. rotate). Les
    SENTENCES_PER_ROUND premières font la séance, les suivantes remplacent celles dont la déclinaison échoue.
    Seulement les phrases des leçons cochées dans les paramètres (cf. demande explicite du user) : la leçon en cours,
    les leçons antérieures, ou les deux ; jamais d'autres, même si la séance est alors plus courte. Les deux cochées,
    CURRENT_LESSON_SENTENCES phrases de la séance viennent de la leçon en cours (moins si elle n'en a pas assez), les
    autres des leçons antérieures."""
    level = lesson_number(lesson)
    seen: set[tuple[str, ...]] = set()
    mine = rotate(lesson, lambda item: lesson_number(item.lesson) == level, seen) if current else []
    older = rotate(lesson, lambda item: is_previous(lesson_number(item.lesson), level), seen) if previous else []
    if not (mine and older):
        return mine or older
    count = min(CURRENT_LESSON_SENTENCES, len(mine))
    count = max(count, SENTENCES_PER_ROUND - len(older))  # pas assez de phrases antérieures : la leçon complète
    session = mine[:count] + older[:SENTENCES_PER_ROUND - count]
    random.shuffle(session)
    # Réserve : les deux sortes de phrases en alternance.
    rest = [item for pair in zip(mine[count:], older[SENTENCES_PER_ROUND - count:]) for item in pair]
    shortest = min(len(mine) - count, len(older) - SENTENCES_PER_ROUND + count)
    rest += mine[count + shortest:] + older[SENTENCES_PER_ROUND - count + shortest:]
    return session + rest


def pick_target(item: Item, used: list[str]) -> str:
    """La personne cible d'une phrase (cf. demande explicite du user : la liste mélangée, puis la première qui change
    l'accord au présent) : tirée au hasard parmi celles qui obligent à un accord au présent (cf. Element.targets),
    celles déjà demandées dans la séance en dernier recours."""
    allowed = item.element.targets()
    fresh = [code for code in allowed if code not in used]
    return random.choice(fresh or allowed)


def choose_targets(items: list[Item]) -> list[str]:
    """La personne cible de chaque phrase de la séance, choisie d'avance par l'application : les déclinaisons se
    préparent toutes en même temps (cf. DeclensionSession.on_started), sans se voir l'une l'autre."""
    targets: list[str] = []
    for item in items:
        targets.append(pick_target(item, targets))
    return targets


def schema() -> dict:
    """Le schéma de la tâche (cf. schema.py), en mode texte (cf. DeclensionSession.judge_by_app), sur un exemple : la
    phrase « חנה ולאה קוראות עיתון וכותבות מכתב. » (leçon 0.02), son sujet חנה ולאה à mettre à « il » (הוּא), et une
    réponse qui oublie d'accorder le second verbe (וכותבת)."""
    language = "he"  # sans mode de langue
    sentence = "חנה ולאה קוראות עיתון וכותבות מכתב."
    element = sentence_declension.Element("subject", "חנה ולאה", "3fp", ["קוראות", "וכותבות"])
    expected = "הוא קורא עיתון וכותב מכתב."
    declension = sentence_declension.Declension(sentence, "subject", element.word, (0, len(element.word)), "3fp",
                                                "3ms", sentence_declension.REPLACEMENTS["subject"]["3ms"], expected)
    person = sentence_declension.PERSONS_HE["3ms"]
    proposed = {"trouve": True, "type": "sujet", "mot": element.word, "origine": element.person, "cible": "3ms",
                "phrase_declinee": expected}
    heard = "הוא קורא עיתון וכותבת מכתב"
    instruction = ("בּוֹא נַתְחִיל! תַּגִּיד שׁוּב אֶת הַמִּשְׁפָּט, אֲבָל בִּמְקוֹם חנה ולאה תַּגִּיד הוּא, וְתַתְאִים אֶת "
                   "כָּל הַשְּׁאָר.")
    judged = {"fautes": [{"mot": "וכותבת", "commentaire": "Ce verbe ne s'accorde pas avec le nouveau sujet, הוא."}],
              "reponse_prof": "שִׂים לֵב לַפֹּעַל הַשֵּׁנִי, הוּא עוֹד לֹא מַתְאִים לְהוּא."}
    instructions = prompts.without_language_mode(prompts.declension_text_instructions(SENTENCES_PER_ROUND))
    exercise = prompts.declension_text_exercise(1, sentence, element.word, person, expected)
    second = prompts.declension_text_exercise(2, "אני גרה בתל אביב.", "אני", sentence_declension.PERSONS_HE["3mp"],
                                              "הם גרים בתל אביב.")
    congratulations = "\n".join(f"{entry['text']} · {entry['french']}" for entry in CONGRATULATIONS_TEXTS)
    # La réponse orale en texte, sans relecture de l'orthographe ni phonétique : la transcription hébraïque seule.
    spoken = transcription(heard, heard, "", instruction, TEACHER_CONTEXT, role="4", respell=False)[:1]
    return {
        "title": "Déclinaison",
        "intro": "Sur des phrases du cours, l'élève remplace un élément surligné (un sujet, ou une préposition "
                 "déclinée comme לי, לו) par une autre personne, et accorde tout le reste. Mode texte, "
                 f"{SENTENCES_PER_ROUND} phrases par séance. L'application tire les phrases et leurs personnes, "
                 "prépare les déclinaisons en arrière-plan pendant l'accueil, puis juge elle-même chaque phrase redite : "
                 "identique à la phrase attendue, réussie sans modèle ; sinon, un juge relève les fautes et écrit la "
                 "réplique du prof. Le prof donne les consignes et répond aux questions. Seuls les mots déclinés "
                 "comptent : ni prononciation, ni orthographe.",
        "flow": [
            *([[[recorded]]] if (recorded := welcome("declinaison", language)) else []),
            [[step("code", "1 · Les phrases et leurs personnes", source="declension.draw_items · choose_targets",
                   title="L'application tire les phrases, et la personne cible de chacune",
                   text=f"{SENTENCES_PER_ROUND} phrases, dans les sujets de déclinaison du niveau choisi (conjugaisons "
                        "et ל décliné), chacune avec son élément connu d'avance (sujet ou préposition déclinée, cf. "
                        "revision_course.json).",
                   items=("seulement les leçons cochées : la leçon en cours, les leçons antérieures, ou les deux "
                          f"(alors {CURRENT_LESSON_SENTENCES} phrases de la leçon en cours)",
                          "les sujets en alternance, jamais deux fois la même phrase ni une simple variante",
                          "la personne cible : tirée au hasard parmi celles qui changent l'accord au présent (cf. la "
                          "note « Choix de la personne cible »), une autre que celles des phrases précédentes",
                          "les phrases suivantes du tirage en réserve, pour remplacer une phrase sans déclinaison"),
                   hint="À droite : le programme de la séance (un sujet par tuile, avec son petit cours) et le suivi."),
              step("model", "puis · les déclinaisons, en parallèle", model=DECLENSION_MODEL,
                   source="DeclensionSession.on_started · sentence_declension.prepare",
                   title="Écrit la phrase attendue de chaque phrase",
                   text=f"Dès le lancement, pendant l'accueil : {SENTENCES_PER_ROUND} appels en même temps, un par "
                        "phrase, l'élément et la personne imposés. Le modèle n'écrit que la phrase déclinée.",
                   items=("l'application vérifie : élément et cible imposés, phrase attendue en hébreu et différente, "
                          "au moins un accord hors de l'élément, et ses verbes changés",
                          f"sinon un second appel ({sentence_declension.DECLENSION_ATTEMPTS} au plus), puis la phrase "
                          "est remplacée par une de la réserve, avec sa propre personne"),
                   hint="Prêtes en 2 à 3 s, bien avant la première consigne.",
                   system=sentence_declension.PROMPT,
                   message=sentence_declension.declension_request(sentence, "subject", element, ["3ms"]),
                   output=as_json(proposed), small=True)]],
            [[step("code", "2 · La phrase s'affiche", source="DeclensionSession.next_sentence · phrase_suivante",
                   title="La phrase au tableau, le prof donne la consigne",
                   text="Fenêtre « Déclinaison » : la phrase, l'élément surligné et, dessous, en français, ce qu'il "
                        "devient (genre compris). La première, le prof la demande (phrase_suivante) ; les suivantes "
                        "viennent de l'application après une réussite, ou du bouton « Question suivante ».",
                   items=("consigne en hébreu, la personne dite en hébreu (הוּא, אֲנִי (נְקֵבָה)…), jamais la forme "
                          "déclinée",
                          "première phrase : le prof explique la consigne en une ou deux phrases",
                          "les suivantes : quelques mots seulement, sans réexpliquer, une tournure différente"),
                   hint="La phrase attendue est envoyée au prof comme référence : il ne la dit jamais.",
                   parts=(("La fonction phrase_suivante", as_json(NEXT_SENTENCE_TOOL)),
                          ("Réponse de l'application au prof (première phrase)", as_json({"consigne": exercise})),
                          ("Phrase suivante, après une réussite (exemple)",
                           app_message(f"{prompts.NEXT_SENTENCE_AFTER_SUCCESS} {second}")),
                          ("Phrase suivante, par le bouton (exemple)",
                           app_message(f"{prompts.NEXT_SENTENCE_BY_BUTTON} {second}")),
                          ("Consigne du prof (exemple)", instruction)))]],
            [[step("student", "3 · L'élève", title="Redit la phrase déclinée, ou parle au prof",
                   text="Touche le bouton rond, puis, à « Parlez », redit toute la phrase ; touche le carré pour "
                        "envoyer. Il peut aussi l'écrire, ou corriger la transcription au crayon et la renvoyer.",
                   hint="Le micro est ouvert du lancement de la séance à sa fin.")]],
            spoken,
            [[step("code", "5 · Tri : phrase redite ou question au prof ?", source="DeclensionSession.triage",
                   title="Le code décide",
                   text="Le même tri qu'en lecture et en compréhension : la réplique est adressée au prof si elle "
                        "compte au moins 3 mots absents de la phrase et de la phrase attendue, et qu'ils font au moins "
                        "60 % des mots dits, ou si elle n'a aucun mot hébreu. Dans le doute, c'est la phrase redite.",
                   items=("phrase redite : l'application la juge (6), le prof ne la voit que dans l'historique",
                          "adressée au prof : il y répond, en français, sans donner la solution"),
                   hint="Avant la première phrase, tout va au prof (« on y va ? »).",
                   parts=(("Note au prof : adressée au prof", prompts.DECLENSION_ADDRESSED),))]],
            [[step("code", "6a · Identique à la phrase attendue ?", source="sentence_declension.same_sentence",
                   title="Sans modèle",
                   text="Comparées lettre à lettre, sans les nikkoud, la ponctuation ni les espaces. Identique : "
                        "réussie (8b), sans appeler le juge.")],
             [step("model", "6b · Juge de la déclinaison", model=DECLENSION_JUDGE_MODEL,
                   source="sentence_declension.judge",
                   when="Seulement si la phrase redite diffère de la phrase attendue.",
                   text="Juge les seuls mots déclinés (le remplacement, les accords qu'il entraîne) et écrit la "
                        "réplique du prof, en hébreu.",
                   items=("fautes : le mot de l'élève et un commentaire en français, l'hébreu en lettres hébraïques, "
                          "sans jamais la bonne forme",
                          "ni orthographe (une transcription), ni ponctuation, ni autre mot de la phrase",
                          "toute autre formulation correcte acceptée"),
                   system=sentence_declension.JUDGE_PROMPT,
                   message=sentence_declension.judge_request(declension, heard), output=as_json(judged))]],
            [[step("code", "7 · L'évaluation s'affiche", source="DeclensionSession.judge",
                   title="Le verdict de l'application",
                   items=("fenêtre de la réponse : la phrase de l'élève, ses mots fautifs surlignés et commentés ; "
                          "réussie, soulignée en vert",
                          "réussie seulement sans aucune faute",
                          "suivi de la séance : phrase réussie ou ratée"))]],
            [[step("bad", "8a · Phrase ratée", source="DeclensionSession.judge · TextTeacher.say",
                   text="La réplique du juge est dite à la place du prof, et gardée dans son historique. C'est la "
                        "conversation : l'élève redit sa phrase (de nouveau triée, puis jugée : l'évaluation "
                        "précédente disparaît), pose une question au prof, ou passe à la suite.",
                   hint="Le bouton « Question suivante », ou la demande au prof (phrase_suivante), passe à la phrase "
                        "suivante.",
                   output=judged["reponse_prof"])],
             [step("good", "8b · Phrase réussie", source="intros.CONGRATULATIONS_TEXTS · advance",
                   text="Une félicitation en hébreu, tirée au hasard, jouée à la place du prof : sa voix enregistrée "
                        "d'avance, son verbatim et sa traduction affichés ; puis, la félicitation dite (au plus "
                        f"{TEACHER_IDLE_TIMEOUT} s), l'application envoie la phrase suivante au prof.",
                   hint="Retour à l'étape 2. Après la dernière phrase, l'au revoir.",
                   parts=(("Les félicitations", congratulations),))]],
            [[farewell(f"9 · Au revoir (après la phrase {SENTENCES_PER_ROUND})", language)]],
        ],
        "notes": [
            "Choix de la personne cible (choose_targets, Element.targets) : 1. la phrase et son élément viennent des "
            "données (sujet ou préposition déclinée, avec sa personne, son genre et son nombre ; aucun repérage par un "
            "modèle) ; 2. les personnes possibles : pour un sujet, celles d'un autre genre ou d'un autre nombre, règle "
            "du présent (au présent, le verbe ne s'accorde pas en personne : אני מתרחץ, הוא מתרחץ) ; pour une "
            "préposition déclinée, toutes les autres ; 3. l'application en tire une au hasard pour chaque phrase, dès "
            "le lancement, une autre que celles des phrases précédentes tant qu'il en reste ; 4. le modèle n'écrit que "
            "la phrase déclinée, pour cette personne. Le passé et le futur, où le verbe change aussi avec la personne "
            "(il → je), ne sont pas encore pris en compte : leurs cibles de même genre et nombre sont écartées.",
            NO_RESPELL,
            teacher(instructions, prompts.DECLENSION_START,
                    "Accueil, consigne de chaque phrase, et réponses aux questions de l'élève. Il ne juge aucune "
                    "phrase, ne choisit ni les phrases ni les personnes ; seule fonction : phrase_suivante.",
                    "declinaison", language, phonetic=False),
            *teacher_voice("כָּל הַכָּבוֹד!", "Bravo !", "Ici, כותב s'accorde avec הוא : masculin singulier.",
                           {"francais": "Ici, כותב s'accorde avec הוא : masculin singulier.",
                            "hebreu": "כָּאן כּוֹתֵב מַתְאִים לְהוּא: זָכָר יָחִיד."}),
            "Langue (page texte, sans mode de langue) : le prof répond en français à une réplique que l'élève lui "
            "adresse, les mots hébreux cités en lettres hébraïques ; en hébreu, sans lettres latines ni chiffres, à "
            "tout le reste (accueil, consignes, au revoir), comme les répliques de l'application (félicitations, "
            "réplique du juge). Sous chaque réplique en hébreu, sa traduction française : affichée d'office sur "
            "ordinateur, à la place de l'hébreu avec le bouton « אA » sur mobile. Les commentaires écrits des fautes, "
            "en français, mots hébreux en lettres hébraïques.",
            "Ni transcription phonétique ni juge de prononciation : seuls les mots déclinés comptent. Une seule "
            "config, SHARP.",
            "Les félicitations sont enregistrées une fois pour toutes, avec la voix du prof (scripts/"
            "build_revision_intros.py felicitations) ; avec un autre modèle de voix, leur texte est dit à la volée.",
            f"Les messages affichés sont ceux d'un exemple : la phrase « {sentence} » (leçon 0.02), son sujet "
            f"{element.word} à mettre à « il », et la réponse « {heard} ». Les instructions système sont celles du "
            "code actuel.",
        ],
    }

class DeclensionSession(TeacherSession):
    def __init__(self, browser: WebSocket, voice: str, lesson: str, items: list[Item]):
        self.lesson = lesson
        # La séance, puis les phrases de réserve (cf. draw_items).
        self.items = items[:SENTENCES_PER_ROUND]
        self.reserve = items[SENTENCES_PER_ROUND:]
        # La personne cible de chaque phrase, choisie d'avance (cf. choose_targets).
        self.targets = choose_targets(self.items)
        tools = [NEXT_SENTENCE_TOOL, DECLENSION_EVALUATION_TOOL, RETRY_TOOL, LANGUAGE_TOOL]
        super().__init__(browser, GeminiLive(voice, prompts.declension_instructions(len(self.items)),
                                             f"{prompts.DECLENSION_START} {prompts.language_mode(DEFAULT_LANGUAGES["declinaison"])}",
                                             tools))
        self.asked = 0  # phrases déjà servies
        # Déclinaison de chaque phrase, préparée d'avance (la suivante pendant qu'on fait celle-ci).
        self.prepared: dict[int, asyncio.Task] = {}
        self.declension: sentence_declension.Declension | None = None
        # Un essai est attendu (phrase donnée, ou nouvel essai) ; hors de cette phase, c'est la conversation.
        self.answering = False
        self.evaluated = False  # la phrase en cours a déjà été évaluée une fois
        # Fermeture des fenêtres de la phrase précédente : la nouvelle attend qu'elle soit finie pour s'afficher.
        self.closing = False
        self.pending: dict | None = None
        self.heard = ""  # transcription de ce que l'élève a dit depuis la phrase donnée
        self.language = DEFAULT_LANGUAGES["declinaison"]
        self.first_turn_done = False
        self.score = {"declension": {"ok": 0, "ko": 0}}
        self.score_events = 0
        self.finished = False
        # Après une réussite, l'application sert elle-même la phrase suivante (cf. advance).
        self.advance_task: asyncio.Task | None = None
        # L'accueil (ou la question « On y va ? » reposée) a été coupé avant la fin : l'élève ne l'a peut-être pas
        # entendu, et ce qui l'a coupé n'est souvent qu'un bruit (cf. demande explicite du user).
        self.intro_cut = False
        # Le prof a parfois réagi à la phrase de l'élève sans l'évaluer : rien ne s'affichait et la séance restait
        # bloquée (cf. demande explicite du user). Moment où l'élève a parlé hébreu, prof silencieux ; début du tour du
        # prof ; phrase déjà relancée.
        self.attempt_at: float | None = None
        self.turn_started_at = 0.0
        self.nudged = 0
        # Page texte (cf. demande explicite du user, judge_by_app) : l'application juge elle-même les phrases redites
        # et y répond (félicitation, ou réplique du juge) ; le prof donne les consignes et converse.
        self.app_judges = False
        # Ses félicitations, voix comprise (cf. intros.congratulations), données par le routeur ; dites à la volée sinon.
        self.congratulations: list[dict] = [{**entry, "pcm": None} for entry in CONGRATULATIONS_TEXTS]
        self.judging = False  # une phrase redite en cours de jugement

    @property
    def current(self) -> Item | None:
        return self.items[self.asked - 1] if self.asked else None

    async def on_started(self) -> None:
        log.info("Séance de déclinaison lancée · voix %s · leçon %s · %s", self.live.voice, self.lesson,
                 [(i.topic["id"], i.sentence) for i in self.items])
        # Les phrases de la séance, préparées toutes en même temps dès le lancement, pendant l'accueil (cf. demande
        # explicite du user).
        for index in range(len(self.items)):
            self.prepare(index)
        if self.language_modes:
            await self.to_browser({"type": "language", "language": self.language})
        await self.send_topics()
        await self.to_browser({"type": "score", "score": self.score, "event": None})

    async def on_event(self, event) -> None:
        if not self.asked:
            if event.kind == "interrupted":
                self.intro_cut = True
            elif event.kind == "agent_text":
                self.intro_cut = False  # le prof reprend la parole : il repose sa question
        if event.kind == "agent_text" and not self.turn.open:
            self.turn_started_at = time.monotonic()
        await super().on_event(event)
        if event.kind == "turn_complete":
            await self.check_evaluated()

    async def check_evaluated(self) -> None:
        """Le prof vient de répondre à une phrase en hébreu de l'élève sans l'évaluer : on le relance, une fois."""
        if (not self.app_judges and self.answering and not self.evaluated and self.attempt_at is not None
                and self.turn_started_at > self.attempt_at and self.nudged != self.asked and not self.finished):
            self.nudged = self.asked
            log.info("phrase de l'élève non évaluée : relance du prof")
            await self.live.app_message(self.in_mode(prompts.declension_not_evaluated(self.heard.strip())))

    async def tick(self, now: float) -> None:
        if (not self.first_turn_done and self.turn.segments and not self.turn.open
                and 0 < self.playback_until <= now):
            self.first_turn_done = True
            await self.to_browser({"type": "first_turn_done"})

    # --- préparation des déclinaisons -----------------------------------------

    def prepare(self, index: int) -> None:
        if index < len(self.items) and index not in self.prepared:
            item = self.items[index]
            # La personne cible, choisie d'avance (cf. choose_targets).
            task = asyncio.create_task(sentence_declension.prepare(item.sentence, item.element.kind, item.element,
                                                                   target=self.targets[index]))
            self.prepared[index] = task
            self.background.append(task)

    async def declension_for(self, index: int) -> sentence_declension.Declension | None:
        """La déclinaison de la phrase index ; si elle échoue, la phrase est remplacée par une de la réserve."""
        while True:
            self.prepare(index)
            try:
                declension = await self.prepared[index]
            except Exception:
                log.exception("Préparation de la déclinaison impossible")
                declension = None
            if declension is not None or not self.reserve:
                return declension
            log.info("phrase remplacée (pas de déclinaison) : %s", self.items[index].sentence)
            # De préférence une phrase de la même leçon (en cours ou antérieure), pour garder la part de chacune.
            level = lesson_number(self.lesson)
            same = lambda item: ((lesson_number(item.lesson) == level)  # noqa: E731
                                 == (lesson_number(self.items[index].lesson) == level))
            self.items[index] = self.reserve.pop(next((i for i, item in enumerate(self.reserve) if same(item)), 0))
            self.targets[index] = pick_target(self.items[index], self.targets[:index] + self.targets[index + 1:])
            del self.prepared[index]

    # --- programme et suivi ----------------------------------------------------

    async def send_topics(self) -> None:
        # Un sujet peut revenir pour plusieurs phrases : il n'apparaît qu'une fois au programme.
        ids = list(dict.fromkeys(item.topic["id"] for item in self.items))
        topics = {item.topic["id"]: item.topic for item in self.items}
        current = self.current.topic["id"] if self.current else None
        covered = {item.topic["id"] for item in self.items[:max(self.asked - 1, 0)]}
        await self.to_browser({"type": "topics", "current": ids.index(current) if current else -1,
                               "covered": [i for i, topic_id in enumerate(ids) if topic_id in covered],
                               "topics": [{key: topics[topic_id][key] for key in ("short", "label", "rule", "details", "course")}
                                          for topic_id in ids]})

    async def record(self, ok: bool) -> None:
        self.score["declension"]["ok" if ok else "ko"] += 1
        self.score_events += 1
        await self.to_browser({"type": "score", "score": self.score, "event": {
            "kind": "declension", "ok": ok, "question": self.asked, "seq": self.score_events}})

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
                # Il a peut-être déjà donné sa phrase sans que le prof l'évalue (cf. check_evaluated).
                await respond({"consigne": self.in_mode(
                    prompts.declension_not_evaluated(self.heard.strip()) if self.attempt_at is not None
                    else prompts.DECLENSION_STILL_ANSWERING)})
                return
            self.cancel_advance()
            await respond({"consigne": self.in_mode(await self.next_sentence())})
        elif name == DECLENSION_EVALUATION_TOOL["name"]:
            if self.declension is None:
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
            await self.evaluate(args, respond)
        elif name == RETRY_TOOL["name"]:
            if not self.evaluated:
                await respond({"consigne": self.in_mode(prompts.NOTHING_TO_RETRY)})
                return
            await self.to_browser({"type": "declension_evaluation", "evaluation": None})
            self.heard = ""
            await self.set_answering(True)
            await respond({"consigne": self.in_mode(prompts.RETRY_OPENED_EXPRESSION)})
        elif name == LANGUAGE_TOOL["name"]:
            await self.set_language(LANGUAGES.get(args.get("langue"), self.language))
            await respond({"consigne": prompts.language_mode(self.language)})
        else:
            await super().on_tool_call(call)

    async def evaluate(self, args: dict, respond) -> None:
        """Évaluation de la phrase déclinée (cf. expression.py), affichée qu'elle soit réussie ou non (cf. demande
        explicite du user) ; réussie, le prof enchaîne de lui-même sur la phrase suivante."""
        errors = await teacher_errors(args, {"fautes_langue": "language"})
        self.evaluated = True
        answer = align_error_words(hebrew_answer(args.get("reponse_eleve"), self.heard), errors)
        await self.to_browser({"type": "declension_evaluation", "evaluation": {"answer": answer, "errors": errors}})
        succeeded = not errors
        await self.record(succeeded)
        await self.set_answering(False)
        await respond({"resultat": self.in_mode(prompts.DECLENSION_TASK_SUCCESS if succeeded
                                                else prompts.DECLENSION_FAILED)}, when_idle=True)
        if succeeded:
            # C'est l'application qui enchaîne, pas le prof : sinon il donnait une consigne inventée avant
            # d'appeler phrase_suivante, puis la vraie (cf. demande explicite du user).
            self.cancel_advance()
            self.advance_task = asyncio.create_task(self.advance())
            self.background.append(self.advance_task)

    async def advance(self) -> None:
        """Sert la phrase suivante dès que le prof a fini de féliciter l'élève."""
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

    # --- enchaînement ---------------------------------------------------------

    async def next_sentence(self) -> str:
        """Ferme les fenêtres de la phrase en cours, sert la suivante et renvoie la consigne pour le prof."""
        if self.asked >= len(self.items):
            await self.finish()
            return prompts.NO_MORE_SENTENCES
        if self.asked:
            await self.close_windows()
        self.asked += 1
        declension = await self.declension_for(self.asked - 1)
        self.prepare(self.asked)  # la suivante se prépare pendant celle-ci
        if declension is None:
            log.info("plus aucune phrase déclinable")
            await self.finish()
            return prompts.NO_MORE_SENTENCES
        item = self.current
        log.info("phrase %d/%d (%s) : %s → %s", self.asked, len(self.items), item.topic["id"], item.sentence,
                 declension.expected)
        self.declension = declension
        self.evaluated = False
        self.heard = ""
        self.attempt_at = None
        # number distingue seulement une phrase de la suivante à l'écran.
        message = {"type": "declension", "declension": {
            "number": self.asked, **declension.message(SHOW_DECLENSION_EXPECTED)}}
        if self.closing:
            self.pending = message
        else:
            await self.show(message)
        await self.set_answering(True)
        if self.app_judges:
            return prompts.declension_text_exercise(self.asked, declension.sentence, declension.word,
                                                    sentence_declension.PERSONS_HE[declension.target],
                                                    declension.expected)
        return prompts.declension_exercise(self.asked, declension.sentence, declension.word, declension.replacement,
                                           declension.expected)

    async def finish(self) -> None:
        if not self.finished:
            self.finished = True
            await self.set_answering(False)
            await self.to_browser({"type": "phase", "phase": "done"})

    async def show(self, message: dict) -> None:
        await self.to_browser(message)
        await self.send_topics()

    async def close_windows(self) -> None:
        """La fenêtre de la réponse se ferme de bas en haut (cf. demande explicite du user), puis la phrase suivante
        s'écrit au tableau."""
        await self.to_browser({"type": "closing"})
        self.closing, self.pending = True, None

        async def clear() -> None:
            await asyncio.sleep(CLOSING_SECONDS)
            await self.to_browser({"type": "declension_evaluation", "evaluation": None})
            await self.to_browser({"type": "declension", "declension": None})
            # Fin de la fermeture (cf. useRevisionSession, closing).
            await self.to_browser({"type": "question", "question": None})
            self.closing = False
            if self.pending:
                message, self.pending = self.pending, None
                await self.show(message)

        self.background.append(asyncio.create_task(clear()))

    async def on_browser_message(self, data: dict) -> None:
        if data.get("type") == "language" and data.get("language") in prompts.LANGUAGE_NAMES:
            if data["language"] != self.language and self.language_modes:
                await self.set_language(data["language"])
                speaking = await self.cut_teacher()
                await (self.live.app_message if speaking else self.live.note)(prompts.language_switched(self.language))
            return
        # « Question suivante » : après une évaluation, ou pour passer la phrase en cours.
        if data.get("type") != "next" or not self.declension or self.closing or self.finished:
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

    # --- page texte : l'application juge les phrases redites (cf. judge_by_app) -----------------------------

    def judge_by_app(self, instructions: str) -> None:
        """Page texte (cf. demande explicite du user) : plus de mode de langue, ni de relecture de l'orthographe ;
        l'application trie chaque réplique de l'élève (phrase redite, ou adressée au prof) et juge elle-même les
        phrases redites ; le prof (instructions, sans mode de langue) n'évalue plus rien."""
        self.app_judges, self.language_modes, self.language = True, False, "he"
        self.respell_spoken = False
        self.live.instructions = instructions
        self.live.start_message = prompts.DECLENSION_START
        self.live.tools = [NEXT_SENTENCE_TOOL]

    def triage(self, text: str) -> bool:
        """La réplique est-elle la phrase redite (vrai), ou adressée au prof ? Le même tri qu'en lecture et en
        compréhension (cf. reading.to_teacher) : adressée au prof si elle compte assez de mots absents de la phrase et
        de la phrase attendue, ou si elle n'a aucun mot hébreu ; dans le doute, la phrase redite."""
        from app.revision_agent.reading import to_teacher, words  # reading.py importe schema.py, comme ce module
        return bool(words(text)) and not to_teacher(text, [self.declension.sentence, self.declension.expected])

    async def on_student_text(self, text: str, spoken: bool = False, corrected: bool = False) -> None:
        if (not self.app_judges or not text or self.started_at is None or self.declension is None or self.finished
                or self.closing or self.judging):
            await super().on_student_text(text, spoken, corrected)
            return
        answer = self.triage(text)
        log.info("tri : %s", "phrase redite" if answer else "adressée au prof")
        if not answer:
            await self.live.note(prompts.DECLENSION_ADDRESSED)
            await super().on_student_text(text, spoken, corrected)
            return
        self.judging = True
        try:
            await self.judge(text, spoken, corrected)
        finally:
            self.judging = False

    async def judge(self, text: str, spoken: bool, corrected: bool) -> None:
        """La phrase redite : identique à la phrase attendue, réussie sans modèle ; sinon jugée par le juge de la
        déclinaison (cf. sentence_declension.judge), qui écrit aussi la réplique du prof. Réussie : une félicitation
        enregistrée, puis la phrase suivante ; ratée : la réplique du juge, puis la conversation."""
        await self.on_event(LiveEvent("user_text", f"{text} "))
        await self.live.student_text(text, spoken, corrected, respond=False)
        self.cancel_advance()
        if self.evaluated:
            # Un nouvel essai : l'évaluation précédente disparaît.
            await self.to_browser({"type": "declension_evaluation", "evaluation": None})
        declension, reply = self.declension, ""
        if sentence_declension.same_sentence(text, declension.expected):
            log.info("phrase redite identique à la phrase attendue")
            errors = []
        else:
            try:
                judged = await sentence_declension.judge(declension, text)
            except Exception:
                log.exception("Jugement de la déclinaison impossible")
                await self.say({"text": prompts.DECLENSION_JUDGE_FAILED})
                return
            errors, reply = faults(judged["fautes"], "language"), judged["reponse_prof"]
        self.evaluated = True
        await self.to_browser({"type": "declension_evaluation",
                               "evaluation": {"answer": align_error_words(text.strip(), errors), "errors": errors}})
        succeeded = not errors
        await self.record(succeeded)
        await self.set_answering(False)
        if succeeded:
            await self.say(random.choice(self.congratulations))
            # La phrase suivante, dès la félicitation dite (cf. advance).
            self.advance_task = asyncio.create_task(self.advance())
            self.background.append(self.advance_task)
        else:
            await self.say({"text": reply or prompts.DECLENSION_FAILED_REPLY})

    async def say(self, entry: dict) -> None:
        """Une réplique de l'application ({"text"}, et pour une félicitation « french », « hebrew », « spoken »,
        « pcm » : sa traduction connue d'avance et sa voix enregistrée), dite à la place du prof et gardée dans son
        historique (cf. TextTeacher.say)."""
        if entry.get("french"):
            self.known_translations[entry["text"]] = entry
        await self.live.say({"text": entry["text"], "pcm": entry.get("pcm")})

    async def set_answering(self, answering: bool) -> None:
        self.answering = answering
        await self.to_browser({"type": "answering", "answering": answering})

    async def on_user_text(self, text: str) -> None:
        self.heard += text
        # Un essai : de l'hébreu dit pendant que le prof se tait (pas l'écho de sa voix).
        if self.answering and HEBREW_LETTER.search(text) and self.playback_until <= time.monotonic():
            self.attempt_at = time.monotonic()
