"""Construit le catalogue des sujets de révision de /dev/revision-agent et, pour chacun, la liste de ses exercices,
à partir des énoncés du cours (revision_course.json, cf. scripts/build_revision_course.py et demande explicite du user) :
- concept : un sujet par concept retenu ; exercice = complétion d'un énoncé coupé au mot du concept ;
- conjugaison : un sujet par binyan, et dans le פעל par famille de racines (גזרה), la seule qui change le présent ;
  plus les modaux צריך / יכול ; exercice = changer un sujet et accorder ses verbes ;
- preposition : un seul sujet, ל décliné ; exercice = décliner autrement une préposition déclinée ;
- lecture, comprehension : un sujet chacun ; exercice = le texte d'une leçon (un seul par tour, item_text.json) ;
- expression : un sujet par sujet concept, conjugaison ou préposition ; exercice = une question naturelle dont la
  réponse fait pratiquer ce sujet, avec ses indices s'ils existent (verbe, mot, complétion du concept) ;
- question : trois sujets (mot interrogatif simple, avec préposition, avec accord, selon la catégorie de la
  question) ; exercice = une affirmation et sa question modèle.

Le binyan et la racine viennent de item_verbe.json ; la famille se déduit de la racine. Chaque exercice garde la leçon
de sa phrase (début de l'identifiant). Tirage prévu : niveau L → sujets qualifiés (introduced_in ≤ L et au moins un
exercice de leçon ≤ L) → sujet au hasard, jamais deux fois dans une séance → jusqu'à 3 exercices de leçon ≤ L.

Résultat : data/revision_topics.json, {"topics": [{"id", "type", "label", "rule", "introduced_in", "exercises"}]}.

Usage (depuis backend/) : .venv/Scripts/python.exe -m scripts.build_revision_topics
"""

import json
import re
from collections import Counter

from app.config import DATA_DIR
from app.data_loader import get_dataset
from app.revision_agent.passages import lessons_with_text
from app.revision_agent.word import lexicon

OUTPUT = DATA_DIR / "revision_topics.json"
LAST_LESSON = 20

# Famille de racines du פעל qui change la forme du présent, avec sa règle (exemples au présent : m. sg., f. sg.,
# m. pl., f. pl.).
PAAL_FAMILIES = {
    "regulier": ("פעל — racine régulière",
                 "Au présent, le פעל suit le modèle קוֹטֵל : כּוֹתֵב, כּוֹתֶבֶת, כּוֹתְבִים, כּוֹתְבוֹת."),
    "gutturale": ("פעל — racine finissant par ע ou ח",
                  "Quand la racine finit par ע ou ח, le féminin singulier se termine en ‑ַעַת / ‑ַחַת : "
                  "נוֹסֵעַ, נוֹסַעַת, נוֹסְעִים, נוֹסְעוֹת."),
    "lamed-he": ("פעל — racine finissant par ה (ל״ה)",
                 "Quand la racine finit par ה, le féminin singulier garde le ה, seule la voyelle change : "
                 "רוֹאֶה, רוֹאָה, רוֹאִים, רוֹאוֹת."),
    "ayin-vav": ("פעל — racine avec ו au milieu (ע״ו)",
                 "Quand la lettre du milieu de la racine est ו, elle disparaît au présent et le féminin se termine "
                 "en ‑ָה : גָּר, גָּרָה, גָּרִים, גָּרוֹת."),
    "lamed-alef": ("פעל — racine finissant par א (ל״א)",
                   "Quand la racine finit par א, le א reste et le féminin se termine en ‑ת : "
                   "קוֹרֵא, קוֹרֵאת, קוֹרְאִים, קוֹרְאוֹת."),
}
BINYANIM = {
    "פיעל": ("piel", "פיעל", "Au présent, le פיעל suit le modèle מְקַטֵּל : מְדַבֵּר, מְדַבֶּרֶת, מְדַבְּרִים, מְדַבְּרוֹת."),
    "התפעל": ("hitpael", "התפעל",
              "Au présent, le התפעל suit le modèle מִתְקַטֵּל : מִתְרַחֵץ, מִתְרַחֶצֶת, מִתְרַחֲצִים, מִתְרַחֲצוֹת."),
    "הפעיל": ("hifil", "הפעיל", "Au présent, le הפעיל suit le modèle מַקְטִיל : מַזְמִין, מַזְמִינָה, מַזְמִינִים, מַזְמִינוֹת."),
}
MODALS = ("modaux", "Les modaux צריך et יכול",
          "צריך et יכול s'accordent avec le sujet comme des adjectifs : צָרִיךְ, צְרִיכָה, צְרִיכִים, צְרִיכוֹת ; "
          "יָכוֹל, יְכוֹלָה, יְכוֹלִים, יְכוֹלוֹת.")
LAMED = ("ל", "La préposition ל déclinée",
         "La préposition ל prend un suffixe selon la personne, le genre et le nombre : לִי, לְךָ, לָךְ, לוֹ, לָהּ, "
         "לָנוּ, לָכֶם, לָכֶן, לָהֶם, לָהֶן.")


# Nombre d'exercices d'un tour : un seul texte pour la lecture et la compréhension, 3 pour le reste.
PER_ROUND = {"lecture": 1, "comprehension": 1}
TEXT_TOPICS = {
    "lecture": ("lecture", "lecture", "Lecture à voix haute", "Lire à voix haute le texte d'une leçon."),
    "comprehension": ("comprehension", "comprehension", "Compréhension de texte",
                      "Lire le texte d'une leçon, puis répondre à des questions sur son contenu."),
}
# Question ouverte : elle contient un mot interrogatif (les autres appellent un oui ou un non).
OPEN_QUESTION = re.compile(r"(?<![א-ת])[בלמש]?(?:מה|מי|איפה|מאיפה|לאן|למה|מתי|כמה|איך|איזה|איזו|אילו)(?![א-ת])")
QUESTION_TOPICS = {
    "simple": ("Questions avec un mot interrogatif simple",
               "La question commence par le mot interrogatif (מה, מי, איפה, מתי, למה, איך, כמה), suivi du reste "
               "de la phrase ; seule l'information demandée est remplacée."),
    "preposition": ("Questions avec une préposition",
                    "La préposition qui introduit l'information demandée se place devant le mot interrogatif : "
                    "למי, עם מי, את מי, לאן, מאיפה, במה…"),
    "accord": ("Questions avec איזה / איזו / אילו",
               "איזה (masculin), איזו (féminin) et אילו (pluriel) s'accordent avec le nom qui les suit : "
               "איזה ספר, איזו עיר, אילו ספרים ; une préposition éventuelle se place devant (באיזו עיר)."),
}


def lesson_of(phrase_id: str) -> str:
    return phrase_id.split(":")[0]


def paal_family(root: str) -> str:
    """Famille d'une racine du פעל (« ג-ו-ר »), du point de vue du présent."""
    letters = root.split("-")
    if len(letters) == 3 and letters[1] in ("ו", "י"):
        return "ayin-vav"
    if letters[-1] == "ה":
        return "lamed-he"
    if letters[-1] == "א":
        return "lamed-alef"
    if letters[-1] in ("ע", "ח"):
        return "gutturale"
    return "regulier"


def verb_topic(infinitive: str, verbs: dict[str, dict]) -> str | None:
    """Identifiant du sujet de conjugaison d'un verbe (infinitif vide : modal)."""
    if not infinitive:
        return f"conjugaison:{MODALS[0]}"
    verb = verbs.get(infinitive)
    if verb is None:
        return None
    if verb["binyan"] == "פעל":
        return f"conjugaison:paal-{paal_family(verb['racine'])}"
    if verb["binyan"] in BINYANIM:
        return f"conjugaison:{BINYANIM[verb['binyan']][0]}"
    return None


def main() -> None:
    course = json.loads((DATA_DIR / "revision_course.json").read_text(encoding="utf-8"))["phrases"]
    utterances = [(phrase_id, u) for phrase_id, p in course.items() for u in p["utterances"]]
    verbs = {item["pure"].replace(" ", ""): item for item in get_dataset("verbe").values()}

    topics: dict[str, dict] = {}

    def topic(topic_id: str, kind: str, label: str, rule: str, introduced_in: str | None = None) -> dict:
        return topics.setdefault(topic_id, {"id": topic_id, "type": kind, "label": label, "rule": rule,
                                            "introduced_in": introduced_in, "per_round": PER_ROUND.get(kind, 3),
                                            "exercises": []})

    # Lecture, compréhension : les textes des leçons et leurs questions ouvertes.
    texts = get_dataset("text")
    for code in lessons_with_text():
        text = texts[code]
        open_questions = [{"hebrew": q["hebrew"], "french": q["french"]} for q in text.get("questions") or []
                          if OPEN_QUESTION.search(q["hebrew"])]
        topic(*TEXT_TOPICS["lecture"])["exercises"].append({"lesson": code, "title": text.get("title", "")})
        topic(*TEXT_TOPICS["comprehension"])["exercises"].append({
            "lesson": code, "title": text.get("title", ""), "questions": open_questions,
        })

    # Question : les questions modèles de Sol, rangées par catégorie de groupe interrogatif.
    for phrase_id, u in utterances:
        for q in u["questions"]:
            category = q["category"]
            # איזה / איזו / אילו n'apparaissent qu'en leçon 0.15 (concept des mots interrogatifs).
            introduced_in = "0.15" if category == "accord" else None
            topic(f"question:{category}", "question", *QUESTION_TOPICS[category], introduced_in)["exercises"].append({
                "phrase_id": phrase_id, "lesson": lesson_of(phrase_id), "text": u["he"], "hint": q["hint"],
                "question": q["he"], "interrogative": q["interrogative"],
            })

    # Concepts : la règle est l'indice le plus fréquent rédigé par Sol pour ce concept.
    tips: dict[str, Counter] = {}
    for phrase_id, u in utterances:
        for c in u["concepts"]:
            tips.setdefault(c["id"], Counter())[c["concept_tip"]] += 1
            topic(f"concept:{c['id']}", "concept", c["definition"], "", c["id"])["exercises"].append({
                "phrase_id": phrase_id, "lesson": lesson_of(phrase_id), "text": u["he"],
                "concept_word": c["words"], "truncated_one": c["truncated_one"],
                "truncated_two": c["truncated_two"], "concept_tip": c["concept_tip"],
                "translation_tip": c["translation_tip"],
            })
    for code, counter in tips.items():
        topics[f"concept:{code}"]["rule"] = counter.most_common(1)[0][0]

    # Conjugaison et préposition déclinée.
    unknown = Counter()
    for phrase_id, u in utterances:
        for subject in u["subjects"]:
            # Un sujet sert d'exercice à chaque sujet de conjugaison de ses verbes (une seule fois par sujet).
            for topic_id in dict.fromkeys(verb_topic(v["infinitive"], verbs) for v in subject["verbs"]):
                if topic_id is None:
                    unknown.update(v["infinitive"] for v in subject["verbs"] if not verb_topic(v["infinitive"], verbs))
                    continue
                key = topic_id.split(":", 1)[1]
                if key == MODALS[0]:
                    label, rule = MODALS[1:]
                elif key.startswith("paal-"):
                    label, rule = PAAL_FAMILIES[key[len("paal-"):]]
                else:
                    _, label, rule = next(b for b in BINYANIM.values() if b[0] == key)
                topic(topic_id, "conjugaison", label, rule)["exercises"].append({
                    "phrase_id": phrase_id, "lesson": lesson_of(phrase_id), "text": u["he"], "subject": subject,
                })
        for preposition in u["declined_prepositions"]:
            if preposition["base"] == LAMED[0]:
                topic(f"preposition:{LAMED[0]}", "preposition", *LAMED[1:])["exercises"].append({
                    "phrase_id": phrase_id, "lesson": lesson_of(phrase_id), "text": u["he"],
                    "preposition": preposition,
                })
            else:
                unknown[f"préposition {preposition['base']}"] += 1

    # Leçon d'apparition : celle du concept, sinon la première leçon qui en fournit un exercice.
    for t in topics.values():
        t["exercises"].sort(key=lambda e: (e["lesson"], int(e["phrase_id"].split(":")[1]) if "phrase_id" in e else 0))
        t["introduced_in"] = t["introduced_in"] or t["exercises"][0]["lesson"]

    # Expression libre : chaque question naturelle, rangée dans chaque sujet que sa réponse fait pratiquer (concept,
    # conjugaison, ל décliné), dès la leçon de ce sujet. Indices, seulement s'ils existent (cf. demande explicite du
    # user) : le verbe à l'infinitif, un mot du vocabulaire, et ceux de la complétion du concept.
    words = lexicon()
    for phrase_id, u in utterances:
        if not u["questions"]:
            continue
        verb_topics = [(verb_topic(v["infinitive"], verbs), v) for s in u["subjects"] for v in s["verbs"]]
        base_ids = [f"concept:{c['id']}" for c in u["concepts"]] + [t for t, _ in verb_topics if t]
        base_ids += [f"preposition:{LAMED[0]}" for p in u["declined_prepositions"] if p["base"] == LAMED[0]]
        # Le mot le plus récent du vocabulaire de la réponse (hors verbes).
        found = [entry for o in u["vocabulary"] if o["kind"] == "mot"
                 and (entry := words.get((o["key"].replace(" ", ""), "mot")))]
        word = max(found, key=lambda e: e["level"], default=None)
        for base_id in dict.fromkeys(base_ids):
            base = topics[base_id]
            # Le concept du sujet, sinon le premier de la réponse ; le verbe du sujet, sinon le premier de la réponse.
            concept = next((c for c in u["concepts"] if base_id == f"concept:{c['id']}"),
                           u["concepts"][0] if u["concepts"] else None)
            verb = next((words.get((v["infinitive"], "verbe")) for t, v in verb_topics if t == base_id), None) or next(
                (entry for _, v in verb_topics if (entry := words.get((v["infinitive"], "verbe")))), None)
            hints = {
                "verb": verb and {"hebrew": verb["hebrew"], "french": verb["french"]},
                "word": word and {"hebrew": word["hebrew"], "french": word["french"]},
                **({key: concept[key] for key in ("concept_tip", "translation_tip", "truncated_one", "truncated_two")}
                   if concept else {}),
            }
            # Même intitulé et même règle que le sujet qu'il fait pratiquer.
            expression = topic(f"expression:{base_id}", "expression", base["label"], base["rule"],
                               base["introduced_in"])
            expression["exercises"] += [{
                "phrase_id": phrase_id, "lesson": lesson_of(phrase_id), "text": u["he"], "text_fr": u["fr"],
                "question": {"hebrew": q["he"], "french": q["fr"]}, **hints,
            } for q in u["questions"]]
    for t in topics.values():
        if t["type"] == "expression":
            t["exercises"].sort(key=lambda e: (e["lesson"], int(e["phrase_id"].split(":")[1])))
    ordered = sorted(topics.values(), key=lambda t: (t["type"], t["introduced_in"], t["id"]))
    OUTPUT.write_text(json.dumps({"topics": ordered}, ensure_ascii=False, indent=4), encoding="utf-8")

    print(f"{len(ordered)} sujets → {OUTPUT}")
    for t in ordered:
        print(f"  {t['id']:<32} {t['introduced_in']}  {len(t['exercises']):>3} exercices  {t['label']}")
    if unknown:
        print("non rattachés :", dict(unknown))
    print("\nSujets qualifiés par niveau (exercices de leçon ≤ niveau) :")
    for n in range(1, LAST_LESSON + 1):
        level = f"0.{n:02d}"
        qualified = [(t["id"].split(":", 1)[-1], sum(e["lesson"] <= level for e in t["exercises"])) for t in ordered
                     if t["introduced_in"] <= level and any(e["lesson"] <= level for e in t["exercises"])]
        print(f"  {level} : {len(qualified):>2} sujets — " + ", ".join(f"{k} ({n})" for k, n in qualified))


if __name__ == "__main__":
    main()
