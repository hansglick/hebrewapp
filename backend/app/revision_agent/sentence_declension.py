"""Expression libre : déclinaison de la phrase que l'élève vient de réussir (cf. demande explicite du user).

L'application choisit le type d'élément à décliner (de préférence celui du sujet révisé) et propose les personnes
cibles dans un ordre tiré au hasard ; un modèle rapide (DECLENSION_MODEL, lancé pendant que le prof félicite l'élève) y
repère l'élément, prend la première personne qui oblige à un accord (cf. demande explicite du user : sans accord,
l'exercice n'a pas d'intérêt ; un second appel sinon) et écrit la phrase attendue ; l'application vérifie le tout avant de l'afficher et écrit elle-même, sous le mot surligné, la
personne visée (genre compris, cf. REPLACEMENTS). Un seul élément à la fois :
- un sujet : le changer oblige à accorder les verbes et les adjectifs qui s'y rapportent ;
- une préposition déclinée (préposition à suffixe pronominal : לי, לו, אותו, שלי, איתי…) : possession, ressenti,
  complément.
La tâche « Déclinaison » connaît d'avance l'élément de chaque phrase (Element, cf. revision_course.json) : il est
imposé au modèle, qui ne choisit plus que la cible parmi celles qui obligent à un accord, et l'application vérifie en
plus que les verbes de l'élément ont changé.
"""

import json
import logging
import random
import re
from dataclasses import dataclass

from app.revision_agent.config import DECLENSION_MODEL
from app.revision_agent.translate import translate

log = logging.getLogger("revision_agent.sentence_declension")

NIKKUD = re.compile(r"[֑-ׇ]")
HEBREW_WORD = re.compile(r"[א-ת]+")
DECLENSION_ATTEMPTS = 2  # un second appel si le sujet remplacé n'entraîne aucun accord

# Personnes vers lesquelles décliner : code → libellé pour le modèle.
PERSONS = {
    "1ms": "je (masculin)", "1fs": "je (féminin)", "2ms": "tu (masculin)", "2fs": "tu (féminin)",
    "3ms": "il", "3fs": "elle", "1mp": "nous (masculin)", "1fp": "nous (féminin)",
    "2mp": "vous (masculin pluriel)", "2fp": "vous (féminin pluriel)", "3mp": "ils", "3fp": "elles",
}
KINDS = {"sujet": "subject", "preposition": "preposition"}

# Ce que l'élève lit sous le mot surligné : la personne visée, avec son genre dès qu'il n'est pas évident (cf. demande
# explicite du user) — un pronom sujet pour un sujet, un pronom tonique pour une préposition déclinée (לי → « moi »).
REPLACEMENTS = {
    "subject": {
        "1ms": "je (m.)", "1fs": "je (f.)", "2ms": "tu (m.)", "2fs": "tu (f.)", "3ms": "il", "3fs": "elle",
        "1mp": "nous (m.)", "1fp": "nous (f.)", "2mp": "vous (m. pl.)", "2fp": "vous (f. pl.)", "3mp": "ils",
        "3fp": "elles",
    },
    "preposition": {
        "1ms": "moi (m.)", "1fs": "moi (f.)", "2ms": "toi (m.)", "2fs": "toi (f.)", "3ms": "lui", "3fs": "elle",
        "1mp": "nous (m.)", "1fp": "nous (f.)", "2mp": "vous (m. pl.)", "2fp": "vous (f. pl.)", "3mp": "eux",
        "3fp": "elles",
    },
}

PROMPT = """Tu prépares un exercice de déclinaison pour un élève débutant en hébreu, à partir d'une phrase correcte
qu'il vient de dire. On remplace UN seul élément de la phrase par une autre personne, et tout le reste s'accorde.
Deux sortes d'éléments peuvent être remplacés :
- sujet : le sujet d'un verbe (prénom(s), nom ou pronom personnel : דוד, התלמידות, אני, הם…) ; le changer oblige à
  accorder les verbes, les adjectifs et les possessifs qui s'y rapportent ;
- preposition : une préposition déclinée, c'est-à-dire une préposition suivie d'un suffixe pronominal (לי, לך, לו,
  לה, לנו, לכם, להם, אותו, אותה, שלי, שלו, איתי, איתו…), qui exprime notamment la possession (יש לי), le ressenti
  (קר לי) ou un complément (אני כותב לו, אני אוהב אותה).
Choisis UN élément, du type préféré s'il y en a un dans la phrase, sinon de l'autre type. Remplace-le par une des
personnes cibles proposées : la première de la liste, dans l'ordre, qui oblige à changer au moins un AUTRE mot de la
phrase que l'élément lui-même (verbe, adjectif, possessif) — c'est tout l'intérêt de l'exercice. Attention : au
présent, le verbe ne s'accorde qu'en genre et en nombre, pas en personne (הוא מתרחץ, אני מתרחץ, אתה מתרחץ : même
verbe) ; pour un sujet au présent, la cible doit donc changer le genre ou le nombre (הוא מתרחץ → הן מתרחצות, jamais
אני מתרחץ). Une préposition déclinée change d'elle-même (לי → לה) : toute autre personne convient. Un sujet devient le
pronom personnel de la personne choisie (דוד → היא) ; une préposition déclinée garde sa préposition (לי → לה,
אותו → אותנו).
- mot : l'élément exactement tel qu'il est écrit dans la phrase (un ou plusieurs mots, sans rien ajouter) ;
- origine : la personne de l'élément dans la phrase ; cible : la personne choisie ;
- phrase_declinee : toute la phrase après le remplacement, avec tous les accords, sans nikkoud.
Si la phrase ne contient aucun élément remplaçable, trouve = false (et les autres champs vides)."""

SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "trouve": {"type": "BOOLEAN"},
        "type": {"type": "STRING", "enum": list(KINDS)},
        "mot": {"type": "STRING"},
        "origine": {"type": "STRING", "enum": list(PERSONS)},
        "cible": {"type": "STRING", "enum": list(PERSONS)},
        "phrase_declinee": {"type": "STRING"},
    },
    "required": ["trouve", "type", "mot", "origine", "cible", "phrase_declinee"],
}


@dataclass
class Element:
    """Élément à décliner connu d'avance (sujet ou préposition déclinée de revision_course.json) : la tâche
    « Déclinaison » l'impose au modèle, et ne lui propose que les personnes qui obligent à un accord (cf. demande
    explicite du user)."""
    kind: str  # "subject" | "preposition"
    word: str  # tel qu'il est écrit dans la phrase, sans nikkoud
    person: str  # sa personne (code de PERSONS)
    verbs: list[str]  # verbes qui s'accordent avec lui (sujet), sans nikkoud

    @classmethod
    def from_data(cls, kind: str, data: dict) -> "Element":
        person = f"{data.get('person', 3)}{data.get('gender') or 'm'}{'s' if data.get('number') == 'sg' else 'p'}"
        return cls(kind, NIKKUD.sub("", data["he"]).strip(), person if person in PERSONS else "3ms",
                   [NIKKUD.sub("", v["he"]).strip() for v in data.get("verbs") or [] if v.get("he")])

    def targets(self) -> list[str]:
        """Personnes qui obligent à un accord : pour un sujet, un autre genre ou un autre nombre (au présent, le verbe
        ne s'accorde pas en personne) ; pour une préposition déclinée, toute autre personne (elle change d'elle-même)."""
        if self.kind == "preposition":
            return [code for code in PERSONS if code != self.person]
        return [code for code in PERSONS if code[1:] != self.person[1:]]


@dataclass
class Declension:
    sentence: str  # la phrase de l'élève, sans nikkoud
    kind: str  # "subject" | "preposition"
    word: str  # l'élément à remplacer, tel qu'il est écrit dans sentence
    span: tuple[int, int]  # sa position dans sentence
    source: str  # personne d'origine (code de PERSONS)
    target: str  # personne cible
    replacement: str  # la personne visée, en français (cf. REPLACEMENTS)
    expected: str  # la phrase déclinée attendue

    def message(self, show_expected: bool) -> dict:
        """Ce qu'affiche la fenêtre « Déclinaison » (la phrase attendue seulement pour le contrôle du modèle)."""
        return {"sentence": self.sentence, "span": list(self.span), "replacement": self.replacement,
                "kind": self.kind, **({"expected": self.expected, "source": PERSONS[self.source],
                                       "target": PERSONS[self.target]} if show_expected else {})}


def word_span(sentence: str, word: str) -> tuple[int, int] | None:
    match = re.search(rf"(?<![א-ת]){re.escape(word)}(?![א-ת])", sentence)
    return match.span() if match else None


def agreement_changed(declension: Declension) -> bool:
    """Vrai si la phrase attendue change au moins un mot en dehors de l'élément remplacé (un accord)."""
    start, end = declension.span
    expected = set(HEBREW_WORD.findall(declension.expected))
    rest = HEBREW_WORD.findall(declension.sentence[:start]) + HEBREW_WORD.findall(declension.sentence[end:])
    return any(word not in expected for word in rest)


def verbs_changed(declension: Declension, verbs: list[str]) -> bool:
    """Vrai si au moins un des verbes de l'élément (d'après les données) a changé dans la phrase attendue."""
    expected = set(HEBREW_WORD.findall(declension.expected))
    return not verbs or any(verb not in expected for verb in verbs)


async def prepare(sentence: str, preferred: str, element: Element | None = None,
                  avoid: set[str] = frozenset()) -> Declension | None:
    """L'exercice de déclinaison de la phrase (preferred : "subject" | "preposition"), ou None s'il n'y en a pas.
    Un sujet remplacé doit entraîner au moins un accord (cf. demande explicite du user), sinon on recommence ;
    element : l'élément imposé, dont les verbes doivent en plus avoir changé."""
    sentence = NIKKUD.sub("", sentence).strip()
    if not re.search(r"[א-ת]", sentence):
        return None
    for attempt in range(DECLENSION_ATTEMPTS):
        declension = await propose(sentence, preferred, element, avoid)
        if declension is None or declension.kind != "subject" or (
                agreement_changed(declension) and verbs_changed(declension, element.verbs if element else [])):
            return declension
        log.info("déclinaison sans accord (essai %d) : %s → %s", attempt + 1, sentence, declension.expected)
    return None


async def propose(sentence: str, preferred: str, element: Element | None = None,
                  avoid: set[str] = frozenset()) -> Declension | None:
    # Les personnes cibles, dans un ordre tiré au hasard : le modèle prend la première qui oblige à un accord. Pour un
    # élément imposé, seulement celles qui y obligent à coup sûr.
    # avoid : les personnes déjà demandées dans la séance, reléguées en fin de liste pour varier (cf. demande explicite
    # du user).
    allowed = element.targets() if element else list(PERSONS)
    fresh = [code for code in allowed if code not in avoid]
    used = [code for code in allowed if code in avoid]
    targets = random.sample(fresh, len(fresh)) + random.sample(used, len(used))
    kind = next(k for k, v in KINDS.items() if v == (element.kind if element else preferred))
    request = (f"Phrase : {sentence}\nType préféré : {kind}\nPersonnes cibles, dans l'ordre : "
               + ", ".join(f"{code} ({PERSONS[code]})" for code in targets))
    if element:
        request += (f"\nÉlément imposé (n'en choisis pas d'autre) : {element.word}, de type {kind}, à la personne "
                    f"{element.person} ({PERSONS[element.person]}).")
    try:
        result = json.loads(await translate(request, PROMPT, SCHEMA, DECLENSION_MODEL))
    except Exception:
        log.exception("Déclinaison impossible : %s", sentence)
        return None
    log.info("déclinaison proposée : %s", result)
    word = NIKKUD.sub("", str(result.get("mot") or "")).strip()
    expected = NIKKUD.sub("", str(result.get("phrase_declinee") or "")).strip()
    source, target = result.get("origine"), result.get("cible")
    span = word and word_span(sentence, word)
    if element:
        # L'élément et sa personne viennent des données : seule la cible est du modèle, parmi celles proposées.
        source = element.person
        if word != element.word or target not in allowed:
            log.info("déclinaison écartée : élément ou cible hors de ceux imposés")
            return None
    # Contrôles : un élément présent dans la phrase, une cible différente de l'origine, une phrase attendue en hébreu
    # et différente de celle de l'élève.
    if (not result.get("trouve") or not span or result.get("type") not in KINDS or target not in PERSONS
            or source not in PERSONS or source == target or not re.search(r"[א-ת]", expected)
            or expected == sentence):
        log.info("déclinaison écartée")
        return None
    kind = KINDS[result["type"]]
    return Declension(sentence, kind, word, span, source, target, REPLACEMENTS[kind][target], expected)
