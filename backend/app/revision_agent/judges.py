"""Les juges de l'évaluation, briques communes aux tâches (cf. demande explicite du user) : chaque dimension d'une
réponse est jugée par un seul code, que chaque tâche assemble selon ce qu'elle évalue.

- Grammaire (fautes de langue) : le prof, qui a entendu l'élève, la juge dans son outil d'évaluation, avec partout les
  mêmes règles (prompts.LANGUAGE_FAULTS, ORAL_ANSWER) et le même champ (error_list) ; teacher_errors met ses fautes au
  format de l'écran.
- Contrainte et plausibilité : un modèle rapide à part (judge_sentence), chaque tâche donnant l'exercice et ses
  règles ; sense_errors en tire les fautes à afficher.
- Prononciation (double route voyelle) : un modèle rapide à part (mispronounced).
- Vérité d'après le texte (compréhension) : le prof, seul à connaître le texte (cf. comprehension.py).
Les fautes relevées par un juge à part sont signalées au prof (judged_note), pour qu'il puisse en parler.

Une faute, à l'écran : {"word" (surligné dans la réponse), "kind" (cf. Assessment.ERROR_KINDS), "comment"} ; une
remarque (kind « note » : la forme courante de l'hébreu parlé, cf. VERDICT) ne fait pas rater la réponse (cf. no_fault), ne s'affiche pas (cf.
useRevisionSession.withoutNotes) et n'est pas dite au prof (cf. judged_note), cf. demande explicite du user.
"""

import json
import logging
import re

from app.revision_agent.config import JUDGE_MODEL
from app.revision_agent.evaluation import french_texts, letters
from app.revision_agent.translate import translate

log = logging.getLogger("revision_agent.judges")


# --- grammaire : le prof -------------------------------------------------------

# Le commentaire d'une faute, par défaut : l'origine de l'erreur, jamais la solution (cf. demande explicite du user).
NO_SOLUTION = ("En français, en quelques mots, factuellement : l'origine de l'erreur (« ce n'est pas le pronom "
               "demandé », « mauvaise conjugaison », « il manque la préposition »). Ne donne JAMAIS la forme correcte ni "
               "la solution, ni en hébreu ni en français")


def error_list(description: str, comment: str = NO_SOLUTION) -> dict:
    """Champ des fautes relevées par le prof dans son outil d'évaluation : le mot fautif (surligné à l'écran) et un
    commentaire (comment : ce qu'il dit)."""
    return {
        "type": "ARRAY",
        "description": description,
        "items": {
            "type": "OBJECT",
            "properties": {
                "mot": {"type": "STRING",
                        "description": "Le mot fautif, recopié exactement tel qu'il est écrit dans reponse_eleve"},
                "commentaire": {"type": "STRING", "description": comment},
            },
            "required": ["mot", "commentaire"],
        },
    }


def no_fault(errors: list[dict]) -> bool:
    """Réponse réussie : aucune faute, les remarques (kind « note ») ne comptant pas (cf. demande explicite du user)."""
    return all(e["kind"] == "note" for e in errors)


def faults(items, kind: str) -> list[dict]:
    """Des fautes {"mot", "commentaire"} (du prof ou d'un juge à part) au format de l'écran ; les vides sont
    écartées."""
    errors = [{"word": str(f.get("mot") or "").strip(), "kind": kind, "comment": str(f.get("commentaire") or "").strip()}
              for f in items or [] if isinstance(f, dict)]
    return [e for e in errors if e["word"] or e["comment"]]


async def teacher_errors(args: dict, kinds: dict[str, str]) -> list[dict]:
    """Les fautes relevées par le prof (kinds : champ de son outil → type de faute), commentaires en français, l'hébreu
    cité en écriture hébraïque (cf. evaluation.french_texts)."""
    errors = [e for field, kind in kinds.items() for e in faults(args.get(field), kind)]
    for error, text in zip(errors, await french_texts([e["comment"] for e in errors])):
        error["comment"] = text
    return errors


# --- contrainte et plausibilité : un modèle à part ----------------------------

JUDGE_PROMPT = """Tu es professeur d'hébreu. {exercise}
Tu reçois, en JSON, {inputs} et phrase_eleve, la phrase de l'élève (transcrite de l'oral, éventuellement avec des
fautes de langue : ne les juge pas, un autre s'en charge).
Juge :
{criteria}
Pour chacun, ok (vrai si la phrase de l'élève le respecte) et un texte en français, en quelques mots, factuel, qui
décrit sa phrase sur ce point (« tu emploies bien ל devant la destination », « la phrase n'a pas de sens : on ne
voyage pas vers une table »).
Pour chaque problème, le mot de la phrase de l'élève qui le porte, recopié exactement (vide si aucun mot précis), et
un commentaire en français, en quelques mots, factuel. Ni les textes ni les commentaires ne donnent JAMAIS la
solution : ni la bonne forme, ni une phrase possible.
Tout mot hébreu cité s'écrit en écriture hébraïque."""


def plausibility(scope: str = "", extra: str = "") -> str:
    """Règle de plausibilité, commune aux tâches : scope précise la phrase jugée, extra ajoute ce que la tâche
    exige."""
    return (f"la phrase{scope} a un sens et pourrait se dire dans la vie courante. Ce n'est pas la vérité qui compte : "
            "l'élève dit ce qu'il veut. Toute phrase sensée est juste, même très simple, même avec des mots plus "
            f"avancés que le niveau.{' ' + extra if extra else ''}")


async def judge_sentence(exercise: str, inputs: dict, sentence: str, criteria: dict[str, str]) -> dict:
    """La phrase de l'élève jugée par le modèle rapide sur chaque critère (criteria : nom → règle, « contrainte »,
    « plausibilite »…) : {nom: {"ok", "texte"}, "problemes": [{"mot", "commentaire"}]} ; tout juste si l'appel
    échoue."""
    criterion = {"type": "OBJECT", "properties": {"ok": {"type": "BOOLEAN"}, "texte": {"type": "STRING"}},
                 "required": ["ok", "texte"]}
    schema = {"type": "OBJECT",
              "properties": {**{name: criterion for name in criteria},
                             "problemes": {"type": "ARRAY", "items": {
                                 "type": "OBJECT",
                                 "properties": {"mot": {"type": "STRING"}, "commentaire": {"type": "STRING"}},
                                 "required": ["mot", "commentaire"]}}},
              "required": [*criteria, "problemes"]}
    prompt = JUDGE_PROMPT.format(exercise=exercise, inputs=", ".join(inputs),
                                 criteria="\n".join(f"- {name} : {rule}" for name, rule in criteria.items()))
    request = json.dumps({**inputs, "phrase_eleve": sentence}, ensure_ascii=False)
    try:
        result = json.loads(await translate(request, prompt, schema, JUDGE_MODEL, "Juge de la phrase"))
    except Exception:
        log.exception("Jugement impossible : %s", sentence)
        return {**{name: {"ok": True, "texte": ""} for name in criteria}, "problemes": []}
    log.info("jugée : %s → %s", sentence, result)
    return {**{name: {"ok": bool((result.get(name) or {}).get("ok", True)),
                      "texte": str((result.get(name) or {}).get("texte") or "").strip()} for name in criteria},
            "problemes": result.get("problemes") or []}


def sense_errors(judged: dict, default: str) -> list[dict]:
    """Les fautes à afficher d'un jugement : aucune s'il respecte tous les critères ; sinon ses problèmes (default si
    le juge n'en a donné aucun)."""
    if all(value["ok"] for name, value in judged.items() if name != "problemes"):
        return []
    return [e for e in faults(judged["problemes"], "sense") if e["comment"]] or [
        {"word": "", "kind": "sense", "comment": default}]


# --- signalées au prof -------------------------------------------------------

# Fautes relevées par un juge à part ; les remarques (kind « note ») ne sont pas dites au prof.
JUDGED_KINDS = {"sense": "sens", "pronunciation": "prononciation"}


def judged_note(errors: list[dict]) -> str | None:
    """Les fautes relevées par un juge à part, pour que le prof puisse en parler (None s'il n'y en a pas)."""
    judged = [e for e in errors if e["kind"] in JUDGED_KINDS]
    if not judged:
        return None
    return ("L'application a relevé dans sa réponse ces fautes, affichées avec ton évaluation : "
            + " ; ".join(f"{JUDGED_KINDS[e['kind']]}{f' sur « {e['word']} »' if e['word'] else ''} : "
                         f"{e['comment'].rstrip('.')}" for e in judged) + ".")


# --- prononciation : un modèle à part ----------------------------------------

# Double route voyelle, les trois tâches (cf. demande explicite du user) : la prononciation est jugée par un appel à
# part, en même temps que le reste de l'évaluation ; le prof, Flash-Lite, ne relevait pas ces fautes parmi tout ce qu'il
# a à juger (« ivrat » pour עברית, 0 fois sur 4, vérifié). Mot par mot, sa prononciation correcte écrite avant ce qui a
# été entendu : sans cela, « va » pour בא passait, ב pouvant se lire b ou v (vérifié, avec Flash comme avec Flash-Lite).
ANSWER_INPUT = """Voici la transcription en hébreu de la réponse orale d'un élève débutant, et sa prononciation
entendue, écrite en lettres latines, voyelles comprises, par un autre modèle qui a écouté le même enregistrement.
La transcription n'a pas de voyelles, et une même lettre peut s'y lire de deux façons (ב : b ou v, כ : k ou kh, פ : p
ou f) : ne suppose jamais que l'élève a lu le mot autrement. Ne juge que la prononciation : ni la grammaire, ni le
choix des mots, ni l'orthographe de la transcription.
Pour chaque mot de la transcription, dans l'ordre :
- mot : le mot tel qu'il est écrit dans la transcription ;
- correct : sa prononciation correcte dans cette phrase, en lettres latines (בא dans « הוא בא » : « ba ») ;"""
READING_INPUT = """Voici un texte hébreu qu'un élève débutant vient de lire à voix haute, sa prononciation correcte, et
sa prononciation entendue, écrite en lettres latines, voyelles comprises, par un modèle qui a écouté sa lecture. Ne
juge que la prononciation des mots qu'il a lus : un mot sauté, ajouté ou remplacé par un autre est relevé ailleurs ;
ni le nom du personnage en tête d'une réplique (« דוד: »), ni une hésitation, ni un mot repris s'il finit par le lire
juste.
Pour chaque mot du texte, dans l'ordre :
- mot : le mot tel qu'il est écrit dans le texte, sans nikkoud ;
- correct : sa prononciation, reprise de la prononciation correcte ;"""
# Prononciations déjà vérifiées que l'hébreu israélien parlé admet toutes : l'une pour l'autre, une remarque, même si
# le juge l'oublie (filet de sécurité de la règle « remarque » de VERDICT, cf. demande explicite du user). Mot sans
# nikkoud : ses prononciations, en lettres latines ; à compléter ici.
ACCEPTED_VARIANTS = {
    "איפה": {"eifo", "eyfo", "efo"},
    "בבית": {"beveit", "bebeit"},  # « be-beit kafe », très courant
    "ופרות": {"uferot", "uperot", "veperot", "veferot"},
}
# Trois sortes d'écart (cf. demande explicite du user) : une faute ; une remarque, la forme courante de l'hébreu parlé
# là où le nikkoud demande la forme normative, dans trois règles nommées seulement (une règle vague, le juge l'étendait
# à de vraies fautes : « ifo » pour « eifo », vérifié) ; ni l'un ni l'autre, un écart léger ou indiscernable.
VERDICT = """- entendu : ce que l'élève a prononcé de ce mot, repris de la prononciation entendue (« va ») ;
- faute : vrai si l'élève a prononcé le mot autrement que correct : une autre voyelle, une autre consonne (b/v, k/kh,
  p/f compris), une consonne omise, une syllabe en moins ou en trop (« shalam » pour « shalom », « ivrat » pour
  « ivrit », « va » pour « ba »). Un h omis au début du mot écrit est une faute, qu'il soit la première lettre du mot
  ou celle de son préfixe (« u » pour « hu », « arbe » pour « harbe », « a-brit » pour « ha-brit ») ; seul un h au
  milieu du mot, après un préfixe compris, est toléré (« me-arbe » pour « me-harbe ») ;
- remarque : vrai si le seul écart est la forme courante de l'hébreu israélien parlé, là où le nikkoud demande la
  forme normative, pour l'une de ces trois règles seulement :
  1. le ו de liaison (« et ») : « ve », « u » ou « vi » l'un pour l'autre (« ve-david » pour « u-david »,
     « ve-yerakot » pour « vi-rakot ») ;
  2. le dagesh kal : la première lettre du mot, ב, כ ou פ, en tête ou juste après un préfixe, dite dure (b, k, p) là
     où le nikkoud l'adoucit (v, kh, f) (« banim » pour « vanim », « be-beit » pour « be-veit », « ve-perot » pour
     « u-ferot ») ; ailleurs dans le mot, une lettre dite dure reste une faute (« abib » pour « aviv »), comme
     l'inverse, adoucir une lettre dure (« va » pour « ba ») ;
  3. la voyelle tséré : « ei » ou « e » l'un pour l'autre (« efo » pour « eifo »).
  Tout autre écart, même proche, reste une faute (« ifo » pour « eifo ») ; si remarque est vrai, faute est faux ;
- ni faute ni remarque : les écarts légers, ou que la prononciation entendue ne permet pas de distinguer :
  - un accent de débutant (le r, kh dit à la française, l'accent tonique) ;
  - deux façons d'écrire le même son (kh/ch, tz/ts) ;
  - un shva ou un petit i/e entre deux consonnes (« liknot » pour « li-knot ») ou autour d'un y (« rusiya »,
    « ruseya » pour « rusya ») ;
  - un f collé à une autre consonne, qui sonne v (« livgosh » pour « lifgosh ») ;
  - un r noté kh juste après une consonne sourde (t, p, k, s, sh, ts, f, kh) : le r, dit au fond de la gorge, y perd
    sa vibration et sonne kh (« mitkhagel » pour « mitragel ») ; ailleurs, un kh pour un r reste une faute (« khak »
    pour « rak ») ;
  - un mot qu'on ne retrouve pas dans la prononciation entendue ;
- commentaire, si faute ou remarque : en français, ce que l'élève a prononcé et comment le mot se prononce, le mot en
  hébreu avec nikkoud et sa prononciation en lettres latines entre guillemets (« tu as dit « va », on dit בָּא,
  « ba » »)."""
PRONUNCIATION_SCHEMA = {
    "type": "ARRAY",
    "items": {"type": "OBJECT",
              "properties": {"mot": {"type": "STRING"}, "correct": {"type": "STRING"}, "entendu": {"type": "STRING"},
                             "faute": {"type": "BOOLEAN"}, "remarque": {"type": "BOOLEAN"},
                             "commentaire": {"type": "STRING"}},
              "required": ["mot", "correct", "entendu", "faute", "remarque"]},
}


def accepted_variant(word: dict) -> bool:
    """Le mot prononcé d'une façon admise pour une autre (cf. ACCEPTED_VARIANTS), qu'il y ait vu une faute ou non."""
    variants = ACCEPTED_VARIANTS.get(letters(str(word.get("mot") or "")), set())
    said = {re.sub(r"[^a-z]", "", str(word.get(key) or "").lower()) for key in ("correct", "entendu")}
    return len(said) == 2 and said <= variants


def pronunciation_request(text: str, phonetic: str, expected_phonetic: str = "") -> tuple[str, str]:
    """L'instruction et le message du juge de prononciation (cf. mispronounced, et le schéma de chaque tâche)."""
    if expected_phonetic:
        return (f"{READING_INPUT}\n{VERDICT}",
                f"Texte lu : {text}\nPrononciation correcte : {expected_phonetic}\nPrononciation entendue : {phonetic}")
    return f"{ANSWER_INPUT}\n{VERDICT}", f"Transcription : {text}\nPrononciation entendue : {phonetic}"


async def mispronounced(text: str, phonetic: str, model: str, expected_phonetic: str = "") -> list[dict]:
    """Les mots mal prononcés ([{"mot", "commentaire", "entendu", "remarque"}], remarque : la forme courante de
    l'hébreu parlé, pas une faute importante) : d'une réponse, text sa transcription ; d'une lecture, text le texte
    lu et expected_phonetic sa prononciation correcte. Aucun si l'appel échoue."""
    prompt, contents = pronunciation_request(text, phonetic, expected_phonetic)
    try:
        words = [w for w in json.loads(await translate(contents, prompt, PRONUNCIATION_SCHEMA, model,
                                                     "Juge de prononciation") or "[]")
                 if isinstance(w, dict)]
    except Exception:
        log.exception("contrôle de la prononciation impossible : %s · %s", text, phonetic)
        return []
    log.info("prononciation (%s) : %s · %s → %s", model, text, phonetic,
             " ".join(f"{w.get('mot')} ({w.get('correct')}/{w.get('entendu')}"
                      f"{', faute' if w.get('faute') else ', remarque' if w.get('remarque') else ''})" for w in words))
    for w in words:
        if accepted_variant(w):
            w["faute"], w["remarque"] = False, True
            w["commentaire"] = (f"tu as dit « {w['entendu']} » pour {w['mot']}, qui se dit aussi "
                                f"« {w['correct']} » : les deux se disent.")
    return [{"mot": str(w.get("mot") or "").strip(), "commentaire": str(w.get("commentaire") or "").strip(),
             "entendu": str(w.get("entendu") or "").strip(),
             "remarque": bool(w.get("remarque")) and not w.get("faute")}
            for w in words if (w.get("faute") or w.get("remarque")) and str(w.get("commentaire") or "").strip()]
