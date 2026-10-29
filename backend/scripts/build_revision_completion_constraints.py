"""Ajoute à chaque concept d'un énoncé sa contrainte de complétion (« constraint », cf. demande explicite du user) :
la consigne courte, en style télégraphique, affichée sous le début de phrase dans la tâche « Complétion » (« utilise
la préposition de direction ל »). Elle est propre à l'énoncé : elle vise la façon dont il emploie le concept (« אין
+ ל » pour une absence, « צריך » ou « יכול »…), sans jamais donner la suite de la phrase.

Sol (raisonnement medium), un appel par concept. Seuls les concepts dont l'énoncé a un début (truncated_one non vide)
servent à la complétion : les autres n'ont pas de contrainte.
La contrainte est écrite dans revision_concept_pool.json (la source, cf. build_revision_concept_pool.py) et dans
revision_course.json (cf. build_revision_course.py, qui la recopie).

Usage (depuis backend/) : .venv/Scripts/python.exe -m scripts.build_revision_completion_constraints [concept ...]
Sans argument, tous les concepts ; avec des codes (« 0.08 »), seulement ceux-là (les autres sont gardés).
"""

import asyncio
import json
import re
import sys

from openai import AsyncOpenAI
from pydantic import BaseModel

from app.config import DATA_DIR, OPENAI_API_KEY
from app.revision_agent.config import EVALUATOR

COURSE = DATA_DIR / "revision_course.json"
POOL = DATA_DIR / "revision_concept_pool.json"
MAX_WORDS = 10  # une contrainte plus longue n'est plus télégraphique : on la redemande

PROMPT = """Tu es professeur d'hébreu. Exercice de complétion pour débutants francophones : l'élève voit le début
d'une phrase hébraïque et doit la compléter de vive voix, librement (toute suite plausible est juste), en respectant
une contrainte de grammaire. On te donne le concept de grammaire travaillé et, pour chaque phrase numérotée, la
phrase d'origine, le début affiché et les mots de la phrase qui portent le concept.

Écris la contrainte de chaque phrase : la consigne affichée sous le début de phrase.
- En français, style télégraphique, à l'impératif, en minuscules, 10 mots au plus, sans point final : « utilise la
  préposition de direction ל », « exprime une absence avec אין + ל », « ajoute un nombre accordé au nom », « utilise
  le modal צריך ».
- Elle vise la façon dont CETTE phrase emploie le concept (possession ou absence, צריך ou יכול, אחרי ou אחר כך…),
  pour que la réponse pratique ce point précis, et pas le concept par un autre biais.
- Elle peut citer le mot-outil invariable du concept (ל, יש, אין, את, הכי, צריך, יכול, אחרי, אחר כך), toujours en
  écriture hébraïque, sans nikkoud ; jamais une forme déclinée ou conjuguée (לי, לו, צריכה, יכולים…), ni un mot de
  la suite de la phrase (lieu, objet, personne…) : l'élève l'invente.
- Elle ne dit jamais le sens de la suite : ni le nombre (« trois »), ni la sensation (« froid »), ni ce qui est
  aimé, possédé, fait ou demandé (« quelle ville ») ; seulement l'outil de grammaire et sa forme (« ajoute un
  nombre accordé au nom », « exprime une sensation avec ל décliné », « demande ce qu'elle préfère avec הכי »).
- Elle doit pouvoir se suivre à partir du début affiché, sans rien changer à ce début.
- Pas de « tu dois », pas d'explication de la règle, pas d'exemple."""


class Constraint(BaseModel):
    number: int
    constraint: str


class Constraints(BaseModel):
    constraints: list[Constraint]


def hebrew(text: str) -> bool:
    return bool(re.search(r"[א-ת]", text or ""))


def valid(text: str) -> bool:
    return bool(text) and len(text.split()) <= MAX_WORDS and not re.search(r"[֑-ׇ]", text)


async def concept_constraints(client: AsyncOpenAI, code: str, definition: str,
                              items: list[dict]) -> dict[int, str]:
    """Contraintes des énoncés du concept, par numéro (à partir de 1) ; on redemande une fois celles qui manquent ou
    sont trop longues."""
    found: dict[int, str] = {}
    todo = list(range(1, len(items) + 1))
    for attempt in range(2):
        if not todo:
            break
        response = await client.responses.parse(
            model=EVALUATOR["model"],
            reasoning={"effort": EVALUATOR["effort"]},
            input=[
                {"role": "system", "content": PROMPT},
                {"role": "user", "content": f"Concept : {definition}\n\n" + "\n".join(
                    f"{n}. Phrase : {items[n - 1]['he']}\n   Début affiché : {items[n - 1]['truncated_one'].strip()}"
                    f"\n   Mots du concept : {' … '.join(items[n - 1]['words'])}" for n in todo)},
            ],
            text_format=Constraints,
        )
        for c in response.output_parsed.constraints:
            text = c.constraint.strip().rstrip(".").replace("’", "'")
            text = text[:1].lower() + text[1:]
            if c.number in todo and valid(text):
                found[c.number] = text
        todo = [n for n in todo if n not in found]
    for n in todo:
        print(f"  {code} : pas de contrainte pour « {items[n - 1]['he']} »", flush=True)
    print(f"{code} : {len(found)}/{len(items)} contraintes", flush=True)
    return found


async def main(codes: list[str]) -> None:
    course = json.loads(COURSE.read_text(encoding="utf-8"))
    by_concept: dict[str, list[tuple[str, dict, dict]]] = {}
    definitions: dict[str, str] = {}
    for phrase_id, p in course["phrases"].items():
        for u in p["utterances"]:
            for c in u["concepts"]:
                if (not codes or c["id"] in codes) and hebrew(c.get("truncated_one")):
                    by_concept.setdefault(c["id"], []).append((phrase_id, u, c))
                    definitions[c["id"]] = c["definition"]

    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    concepts = sorted(by_concept)
    results = await asyncio.gather(*(
        concept_constraints(client, code, definitions[code],
                            [{**c, "he": u["he"]} for _, u, c in by_concept[code]]) for code in concepts))

    constraints: dict[tuple[str, str, str], str] = {}
    for code, found in zip(concepts, results):
        for n, (phrase_id, u, c) in enumerate(by_concept[code], 1):
            if n in found:
                c["constraint"] = found[n]
                constraints[(phrase_id, u["he"], code)] = found[n]
    COURSE.write_text(json.dumps(course, ensure_ascii=False, indent=1), encoding="utf-8")

    source = json.loads(POOL.read_text(encoding="utf-8"))
    for phrase_id, entries in source.items():
        for entry in entries:
            for c in entry["concepts"]:
                if (constraint := constraints.get((phrase_id, entry["text"], c["concept"]))) is not None:
                    c["constraint"] = constraint
    POOL.write_text(json.dumps(source, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(constraints)} contraintes → {COURSE.name}, {POOL.name}")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
