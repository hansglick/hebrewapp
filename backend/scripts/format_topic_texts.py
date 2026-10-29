"""Met en forme le petit cours de chaque sujet d'expression libre, affiché sous le programme de /dev/revision-agent
(cf. demande explicite du user) : une introduction, puis une puce par règle (ou par forme, pour une conjugaison) avec
ses exemples, et une remarque finale facultative.

Source : data/expression_topic_texts.json, champ « details » de chaque sujet (texte rédigé pour le seul concept
retenu). Sol (EVALUATOR, un appel par sujet) en tire le champ « course », écrit dans le même fichier :
    "course": {"intro": str,
               "points": [{"term": str, "meaning": str, "rule": str, "examples": [{"he": str, "fr": str}]}],
               "note": str}
Seuls les sujets sans « course » sont traités : un cours retouché à la main n'est jamais écrasé (pour en refaire un,
supprimer son champ « course » et relancer).

Usage (depuis backend/) : .venv/Scripts/python.exe -m scripts.format_topic_texts
"""

import asyncio
import json

from openai import AsyncOpenAI
from pydantic import BaseModel

from app.config import DATA_DIR, OPENAI_API_KEY
from app.revision_agent.config import EVALUATOR

PATH = DATA_DIR / "expression_topic_texts.json"

PROMPT = """Tu mets en forme le petit cours d'un point de grammaire hébraïque pour un élève francophone débutant. Il
s'affiche à l'écran, sous forme de liste à puces : il doit se lire d'un coup d'œil.
On te donne le titre du sujet et son explication rédigée. Découpe-la ainsi :
- intro : une phrase courte qui dit à quoi sert le point de grammaire (vide si elle n'apporterait rien) ;
- points : une puce par règle, par expression ou par cas distinct. Pour une conjugaison (binyan, modèle de verbe), une
  puce par forme du présent, dans l'ordre masculin singulier, féminin singulier, masculin pluriel, féminin pluriel.
  Chaque puce :
  - term : ce qu'on retient, le plus court possible — l'expression ou la forme hébraïque (en écriture hébraïque, avec
    le nikkoud seulement s'il figure dans l'explication), ou à défaut quelques mots en français (« nom défini ») ;
  - meaning : sa traduction ou sa désignation en français, en quelques mots (« après que », « féminin singulier ») ;
    vide si term est déjà en français ;
  - rule : la règle en une phrase courte, en français (vide si term et meaning suffisent) ;
  - examples : les exemples de l'explication qui illustrent cette puce, chacun en hébreu (he, sans nikkoud) et sa
    traduction française (fr) ; aucun si l'explication n'en donne pas pour cette puce.
- note : une remarque finale courte qui ne rentre dans aucune puce (« Même modèle pour… », « הכי est invariable »),
  ou vide.
Reste strictement fidèle à l'explication : n'ajoute aucune règle, aucun exemple, aucune exception, n'en retire aucune.
Écris en français, en tutoyant l'élève ; tout mot ou lettre hébreu s'écrit en écriture hébraïque, jamais en lettres
latines."""


class Example(BaseModel):
    he: str
    fr: str


class Point(BaseModel):
    term: str
    meaning: str
    rule: str
    examples: list[Example]


class Course(BaseModel):
    intro: str
    points: list[Point]
    note: str


async def course(client: AsyncOpenAI, short: str, details: str) -> dict:
    response = await client.responses.parse(
        model=EVALUATOR["model"],
        reasoning={"effort": EVALUATOR["effort"]},
        input=[{"role": "system", "content": PROMPT},
               {"role": "user", "content": f"Titre : {short}\nExplication : {details}"}],
        text_format=Course,
    )
    return response.output_parsed.model_dump()


async def main() -> None:
    topics = json.loads(PATH.read_text(encoding="utf-8"))
    todo = [topic_id for topic_id, topic in topics.items() if not topic.get("course")]
    print(f"{len(todo)} cours à mettre en forme sur {len(topics)}", flush=True)
    if todo:
        client = AsyncOpenAI(api_key=OPENAI_API_KEY)
        courses = await asyncio.gather(*[course(client, topics[t]["short"], topics[t]["details"]) for t in todo])
        for topic_id, result in zip(todo, courses):
            topics[topic_id]["course"] = result
        PATH.write_text(json.dumps(topics, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"→ {PATH}")


if __name__ == "__main__":
    asyncio.run(main())
