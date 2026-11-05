"""Tâche « Complétion », page texte (cf. demande explicite du user) : la phrase de l'élève jugée par quatre juges en
parallèle — la contrainte, la plausibilité, la grammaire (ici) et la prononciation (judges.mispronounced, comme en
lecture) —, puis réunie par le code (cf. aggregate) : réussie sans aucune faute ; ratée, toutes les fautes s'affichent
et le prof dit la phrase de résumé du juge le plus prioritaire (PRIORITY). Chaque juge écrit la sienne, en hébreu sans
nikkoud ; celle de la prononciation est un modèle rempli par le code (PRONUNCIATION_SUMMARY).

Affichage en deux temps (cf. demande explicite du user) : dès qu'un des trois premiers juges a trouvé une faute, la
réplique du prof est connue (la prononciation vient en dernier) ; on n'attend donc le juge de prononciation que si les
trois autres sont bons ; sinon ses fautes s'ajoutent à l'écran à leur arrivée, et le prof n'en parle pas.
"""

import json
import logging

from app.revision_agent.config import (COMPLETION_CONSTRAINT_MODEL, COMPLETION_GRAMMAR_MODEL,
                                      COMPLETION_PLAUSIBILITY_MODEL)
from app.revision_agent.judges import faults
from app.revision_agent.translate import translate

log = logging.getLogger("revision_agent.completion_judges")

# L'ordre des juges (cf. demande explicite du user) : la réplique du prof est celle du premier en faute.
PRIORITY = ("contrainte", "grammaire", "plausibilite", "prononciation")
NAMES = {"contrainte": "Contrainte", "grammaire": "Grammaire", "plausibilite": "Plausibilité",
         "prononciation": "Prononciation"}

EXERCISE = """Tu es professeur d'hébreu. Ton élève, débutant, fait un exercice de complétion : il voit le début d'une
phrase hébraïque (debut) et une contrainte de grammaire en français (contrainte, qui fait pratiquer concept), et
complète la phrase à voix haute, librement : toute suite qui respecte la contrainte et a du sens est juste, il n'y a
pas de phrase à deviner. action_reference est l'action de la phrase d'origine, une simple référence : l'élève n'est
pas tenu de la suivre. phrase_eleve est sa phrase entière, début compris, transcrite de l'oral (ou écrite) : n'en juge
JAMAIS l'orthographe, c'est une transcription (ת et ט, כ et ח, ק et כ, א et ע, ו et ב, ס, ש et צ se valent : סריך est
צריך), ni la ponctuation ; lis chaque mot comme le mot qu'il veut visiblement dire. Chaque juge ne juge que son axe :
une faute d'un autre axe ne compte pas ici."""

COMMENT = """en français, court et factuel, tout mot hébreu cité écrit en lettres hébraïques ; il ne donne JAMAIS la
forme correcte, ni une suite possible."""

SUMMARY = """- resume : ce que le prof dit ensuite à l'élève, à voix haute, uniquement en hébreu, SANS nikkoud, sans
  aucune lettre latine ni aucun chiffre : une phrase courte et familière, au masculin singulier, qui décrit
  directement le problème, sans compliment ni encouragement avant, sans jamais donner la solution (ni une suite
  possible, ni la forme correcte d'un mot), en le mettant sur la voie ; ne lui propose pas de recommencer. Vide si ok
  est vrai."""

CONSTRAINT_PROMPT = EXERCISE + """
Juge SEULEMENT la contrainte : la phrase emploie-t-elle l'outil de grammaire demandé, de la façon demandée ? « exprime
une absence avec אין + ל » : une possession avec יש est fausse ; « utilise la préposition de direction ל » : une
destination sans ל, ou avec ב, est fausse. Cherche d'abord, dans phrase_eleve, les mots qui emploient l'outil demandé
(début compris) : s'ils y sont, la contrainte est respectée. Une forme de cet outil mal accordée ou mal déclinée, une
faute de grammaire ailleurs dans la phrase (un accord, une préposition, את), un mot répété ou en trop, ou une phrase
sans grand sens ne comptent pas ici : d'autres juges s'en chargent.
- passage : les mots de phrase_eleve qui emploient l'outil demandé, recopiés tels quels ; vide s'il n'y en a pas ;
- ok : vrai si la contrainte est respectée ;
- commentaire : si elle ne l'est pas, ce qui manque, """ + COMMENT + """ Vide si ok est vrai.
""" + SUMMARY

PLAUSIBILITY_PROMPT = EXERCISE + """
Juge SEULEMENT la plausibilité : la phrase entière, début compris, a un sens et pourrait se dire dans la vie courante.
Ce n'est pas la vérité qui compte : l'élève dit ce qu'il veut. Toute phrase sensée est juste, même très simple, même
avec des mots plus avancés que le niveau, même très différente de l'action de référence ; « דוד נוסע לשולחן » ne l'est
pas. Ni la grammaire, ni la contrainte ne comptent ici : une phrase sensée malgré une faute de grammaire est plausible.
- ok : vrai si la phrase est plausible ;
- commentaire : si elle ne l'est pas, pourquoi, """ + COMMENT + """ Vide si ok est vrai.
""" + SUMMARY

GRAMMAR_PROMPT = EXERCISE + """
Juge SEULEMENT la grammaire de la phrase : ni la contrainte, ni le sens ne comptent ici, d'autres juges s'en chargent.
Sont des fautes : un accord manquant ou erroné (sujet et verbe, nom et adjectif, nom et démonstratif, nombre et nom…),
un verbe mal conjugué ou à une forme inadéquate (mauvaise personne, mauvais genre ou nombre, infinitif à la place du
présent, temps qui ne convient pas), un mot erroné ou inexistant, un article, une préposition ou une particule
manquant, en trop ou erroné (ה, את, ל, ב, של…), une préposition qui ne convient pas au verbe, un pronom erroné, un
ordre des mots ou une structure de phrase incorrects. Relis chaque mot, y compris ses préfixes (ה, ו, ב, ל, מ, ש).
Une faute du début affiché n'en est pas une, sauf si la suite de l'élève le rend faux (un accord avec son sujet).
- ok : vrai s'il n'y a aucune faute ;
- fautes : chaque faute, dans l'ordre de la phrase : mot, le mot fautif recopié exactement tel qu'il figure dans
  phrase_eleve (il est surligné à l'écran), et commentaire, l'origine de l'erreur (« mauvaise conjugaison », « il
  manque la préposition »), """ + COMMENT + """ [] si ok est vrai.
""" + SUMMARY

VERDICT_SCHEMA = {"type": "OBJECT",
                  "properties": {"ok": {"type": "BOOLEAN"}, "commentaire": {"type": "STRING"},
                                 "resume": {"type": "STRING"}},
                  "required": ["ok", "commentaire", "resume"]}
# La contrainte : d'abord les mots qui emploient l'outil (passage), puis le verdict (cf. CONSTRAINT_PROMPT) : le
# modèle cherche avant de juger.
CONSTRAINT_SCHEMA = {"type": "OBJECT",
                     "properties": {"passage": {"type": "STRING"}, **VERDICT_SCHEMA["properties"]},
                     "required": ["passage", *VERDICT_SCHEMA["required"]],
                     "propertyOrdering": ["passage", "ok", "commentaire", "resume"]}
GRAMMAR_SCHEMA = {"type": "OBJECT",
                  "properties": {"ok": {"type": "BOOLEAN"},
                                 "fautes": {"type": "ARRAY", "items": {
                                     "type": "OBJECT",
                                     "properties": {"mot": {"type": "STRING"}, "commentaire": {"type": "STRING"}},
                                     "required": ["mot", "commentaire"]}},
                                 "resume": {"type": "STRING"}},
                  "required": ["ok", "fautes", "resume"]}

# Les trois juges écrits ici : leur instruction, leur sortie, leur modèle et leur poste de la facture.
JUDGES = {
    "contrainte": (CONSTRAINT_PROMPT, CONSTRAINT_SCHEMA, COMPLETION_CONSTRAINT_MODEL, "Juge de la contrainte"),
    "plausibilite": (PLAUSIBILITY_PROMPT, VERDICT_SCHEMA, COMPLETION_PLAUSIBILITY_MODEL, "Juge de la plausibilité"),
    "grammaire": (GRAMMAR_PROMPT, GRAMMAR_SCHEMA, COMPLETION_GRAMMAR_MODEL, "Juge de la grammaire"),
}

# La réplique du prof pour une faute de prononciation (le juge de la lecture n'en écrit pas) : le premier mot fautif.
PRONUNCIATION_SUMMARY = "שים לב להגייה של המילה {word}."
# Un juge en faute sans résumé (vide) : une remarque générale, sans la solution.
DEFAULT_SUMMARIES = {"contrainte": "תקרא שוב את ההוראה.", "plausibilite": "המשפט הזה לא כל כך הגיוני.",
                     "grammaire": "יש טעות קטנה במשפט, תבדוק אותו שוב."}


def judge_request(inputs: dict, sentence: str) -> str:
    """La demande commune aux trois juges (inputs : debut, contrainte, concept, action_reference ; aussi pour le
    schéma de la tâche)."""
    return json.dumps({**inputs, "phrase_eleve": sentence}, ensure_ascii=False)


async def judge(name: str, inputs: dict, sentence: str) -> dict:
    """Le verdict d'un juge ({"ok", "commentaire", "resume"}, et « fautes » pour la grammaire) ; juste si l'appel
    échoue (la séance continue)."""
    prompt, schema, model, item = JUDGES[name]
    try:
        result = json.loads(await translate(judge_request(inputs, sentence), prompt, schema, model, item))
    except Exception:
        log.exception("Juge %s impossible : %s", name, sentence)
        return {"ok": True, "commentaire": "", "resume": "", "fautes": []}
    log.info("%s : %s → %s", name, sentence, result)
    verdict = {"ok": bool(result.get("ok", True)), "commentaire": str(result.get("commentaire") or "").strip(),
               "resume": str(result.get("resume") or "").strip(), "fautes": result.get("fautes") or []}
    if name == "grammaire" and verdict["fautes"]:
        verdict["ok"] = False  # une faute relevée fait rater la phrase, même si ok est resté vrai
    return verdict


def errors_of(name: str, verdict: dict) -> list[dict]:
    """Les fautes d'un juge, au format de l'écran : celles de la grammaire, mot par mot ; pour la contrainte et la
    plausibilité, leur commentaire (sans mot surligné)."""
    if verdict["ok"]:
        return []
    if name == "grammaire":
        return faults(verdict["fautes"], "language") or [
            {"word": "", "kind": "language", "comment": "il y a une faute de grammaire dans ta phrase"}]
    return [{"word": "", "kind": "sense",
             "comment": verdict["commentaire"] or ("la contrainte n'est pas respectée" if name == "contrainte"
                                                   else "ta phrase n'a pas vraiment de sens")}]


def pronunciation_verdict(found: list[dict]) -> dict:
    """Le verdict de prononciation, des mots du juge de la lecture (cf. judges.mispronounced) : seulement les fautes,
    les remarques vertes ne s'affichent pas (cf. demande explicite du user)."""
    wrong = [w for w in found if not w.get("remarque")]
    return {"ok": not wrong, "commentaire": "", "fautes": wrong,
            "resume": PRONUNCIATION_SUMMARY.format(word=wrong[0]["mot"]) if wrong else ""}


def aggregate(verdicts: dict[str, dict]) -> dict:
    """Les verdicts des juges réunis (verdicts : nom → verdict, sans « prononciation » s'il n'est pas encore arrivé ou
    pas lancé) : {"ok", "errors", "dimensions", "summary"} ; summary : la réplique du prof, celle du premier juge en
    faute dans l'ordre de PRIORITY (None si la phrase est réussie)."""
    errors = [e for name in PRIORITY if name in verdicts and name != "prononciation"
              for e in errors_of(name, verdicts[name])]
    if "prononciation" in verdicts:
        errors += faults(verdicts["prononciation"]["fautes"], "pronunciation")
    failed = [name for name in PRIORITY if name in verdicts and not verdicts[name]["ok"]]
    summary = None
    if failed:
        summary = verdicts[failed[0]]["resume"] or DEFAULT_SUMMARIES.get(failed[0], "")
    return {"ok": not failed, "errors": errors, "summary": summary,
            "dimensions": [{"name": NAMES[name], "ok": verdicts[name]["ok"],
                            "text": dimension_text(name, verdicts[name])} for name in PRIORITY if name in verdicts]}


def dimension_text(name: str, verdict: dict) -> str:
    """Le texte d'une puce de l'évaluation (cf. completion.dimensions)."""
    if name == "grammaire" or name == "prononciation":
        count = len(verdict["fautes"]) if not verdict["ok"] else 0
        what = "de grammaire" if name == "grammaire" else "de prononciation"
        if not count and verdict["ok"]:
            return f"pas de faute {what}"
        count = count or 1
        return f"{count} faute{'s' if count > 1 else ''} {what}, surlignée{'s' if count > 1 else ''} dans ta phrase"
    if verdict["ok"]:
        return "contrainte respectée" if name == "contrainte" else "phrase plausible"
    text = verdict["commentaire"].rstrip(".")
    return (text[:1].lower() + text[1:]) or ("contrainte non respectée" if name == "contrainte"
                                             else "phrase peu plausible")
