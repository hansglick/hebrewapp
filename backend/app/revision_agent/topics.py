"""Catalogue des sujets de révision (data/revision_topics.json, cf. scripts/build_revision_topics.py), vu par tâche et
par niveau pour le prototype sans agent de /dev/topic-prototype.

Les familles de racines du פעל y forment un seul sujet « פעל » : le prototype s'en tient aux binyanim, mais chaque
exercice garde sa famille (`family`) pour que le tirage d'un sujet en couvre le plus possible (cf. demande explicite
du user).
"""

import json
from functools import cache

from app.config import DATA_DIR
from app.revision_agent.passages import lesson_number

# Tâche du menu → types de sujets du catalogue (la tâche « Mot » n'a pas de sujets).
TASK_TYPES = {
    "lecture": {"lecture"},
    "comprehension": {"comprehension"},
    "expression": {"expression"},
    "declinaison": {"conjugaison", "preposition"},
    "completion": {"concept"},
    "question": {"question"},
}
PAAL_PREFIX = "conjugaison:paal-"
PAAL = {
    "id": "conjugaison:paal",
    "type": "conjugaison",
    "label": "פעל",
    "rule": "Au présent, le פעל suit le modèle קוֹטֵל : כּוֹתֵב, כּוֹתֶבֶת, כּוֹתְבִים, כּוֹתְבוֹת ; selon les lettres "
            "de la racine, certaines formes s'en écartent (גָּר, קוֹרֵאת, יוֹדַעַת, קוֹנָה…).",
}


@cache
def catalogue() -> list[dict]:
    with open(DATA_DIR / "revision_topics.json", encoding="utf-8") as f:
        topics = json.load(f)["topics"]
    families = [t for t in topics if t["id"].startswith(PAAL_PREFIX)]
    paal = {**PAAL, "introduced_in": min((t["introduced_in"] for t in families), key=lesson_number),
            "per_round": families[0]["per_round"],
            # Chaque exercice garde sa famille de racines, pour que le tirage les varie (cf. demande explicite du user).
            "exercises": [{**e, "family": t["label"].removeprefix("פעל — ")} for t in families for e in t["exercises"]]}
    # Le sujet fusionné prend la place de la première famille.
    merged = []
    for topic in topics:
        if not topic["id"].startswith(PAAL_PREFIX):
            merged.append(topic)
        elif topic is families[0]:
            merged.append(paal)
    return merged


def topics_for(task: str, lesson: str) -> list[dict]:
    """Sujets qualifiés de la tâche au niveau `lesson` : introduits au plus tard à ce niveau, avec leurs seuls
    exercices de niveau inférieur ou égal (au moins un)."""
    level = lesson_number(lesson)
    result = []
    for topic in catalogue():
        if topic["type"] not in TASK_TYPES.get(task, ()) or lesson_number(topic["introduced_in"]) > level:
            continue
        exercises = [e for e in topic["exercises"] if lesson_number(e["lesson"]) <= level]
        if exercises:
            result.append({**topic, "exercises": exercises})
    return result
