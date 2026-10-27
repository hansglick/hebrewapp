"""Prépare le second pool de phrases de /dev/revision-agent, pour réviser la déclinaison au sens large (conjugaison,
accords, prépositions déclinées). Parmi les 427 énoncés de revision_phrase_analysis.json (questions comprises, le pool 1
peut les contenir aussi), Sol garde ceux qui ont au moins un sujet, un verbe conjugué et un complément, ou au moins une
préposition déclinée, et relève tout ce qui peut être décliné autrement (cf. demande explicite du user) :
- subjects : chaque sujet explicite, avec sa personne, son genre, son nombre et les verbes qui s'accordent avec lui ;
- declined_prepositions : les prépositions déclinées (מילות יחס נטויות : לי, אותו, איתי, שלי…), avec leur préposition
  de base, leur personne, leur genre et leur nombre.
Résultat : data/revision_svc_pool.json, {identifiant de phrase: [{"text", "subjects", "declined_prepositions"}]}.

Usage (depuis backend/) : .venv/Scripts/python.exe -m scripts.build_revision_svc_pool [--out fichier] [leçon ...]
"""

import asyncio
import json
import sys
from pathlib import Path
from typing import Literal

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from app.config import DATA_DIR, OPENAI_API_KEY
from app.revision_agent.config import EVALUATOR

OUTPUT = DATA_DIR / "revision_svc_pool.json"

PROMPT = """Tu es professeur d'hébreu et linguiste spécialiste de la grammaire de l'hébreu israélien moderne.
On prépare des exercices de déclinaison pour des débutants francophones : l'élève reçoit un énoncé et doit le redire
en changeant la personne, le genre ou le nombre d'un sujet ou d'une préposition déclinée, en accordant le reste.

Pour chaque énoncé numéroté :
1. qualifies : vrai si l'énoncé remplit au moins l'une des deux conditions suivantes :
   a) il contient à la fois
      - un sujet explicite : nom, prénom ou pronom personnel ;
      - un verbe conjugué (au présent, au passé ou au futur) ou à l'impératif, dont c'est le sujet ;
        יש / אין, une phrase nominale sans verbe (« רוני מישראל », « הוא רופא ») ou un simple infinitif ne comptent pas ;
      - un complément de ce verbe : complément d'objet direct ou indirect, complément circonstanciel (lieu, temps,
        manière, moyen, compagnie…) ou infinitif complément (« אני רוצה לאכול ») ;
   b) il contient au moins une préposition déclinée (voir 3), même sans verbe (« יש לי ספר », « קר לי »).
   Si qualifies est faux, laisse les deux listes vides.
2. subjects : chaque sujet explicite d'un verbe conjugué, dans l'ordre de l'énoncé (un sujet sous-entendu n'est pas
   relevé ; un énoncé retenu seulement par la condition b peut n'en avoir aucun) :
   - he : le sujet recopié exactement tel qu'il est écrit dans l'énoncé (pronom, nom avec son article, prénoms
     coordonnés « דוד וחנה ») ; fr : sa traduction ;
   - person : 1, 2 ou 3 ; gender : « m » ou « f » (pluriel mixte : « m » ; pour אני / אתה / את…, d'après la forme
     du verbe) ; number : « sg » ou « pl » ;
   - verbs : tous les verbes conjugués qui s'accordent avec ce sujet, dans l'ordre de l'énoncé, y compris les verbes
     coordonnés qui le partagent (« הם יושבים, כותבים וקוראים » → les trois) :
     - he : recopié exactement tel qu'il est écrit (avec un modal צריך / יכול / רוצה, le modal) ;
     - infinitive : son infinitif, sans nikkoud ; vide pour צריך et יכול, qui n'en ont pas.
3. declined_prepositions : toutes les prépositions déclinées (מילות יחס נטויות) de l'énoncé, dans l'ordre :
   une préposition, ou la particule את, qui porte un suffixe pronominal marquant la personne, le genre et le nombre
   (לי, לך, לו, לה, לנו, לכם, להם, אותי, אותו, איתי, שלי, ממני, עליו, אצלה…), quel que soit son rôle dans la phrase :
   objet, possesseur (יש לי), personne qui ressent (קר לי), destinataire, possession (שלי)…
   - he : recopiée exactement telle qu'elle est écrite dans l'énoncé ; base : la préposition de base (ל, את, עם, של,
     מ, על, ב, אצל…) ;
   - person, gender, number : ceux du pronom qu'elle porte (לך : 2, « m » ou « f » d'après le contexte, « sg »).
   Ne compte pas les pronoms personnels sujets (אני, את, הוא…), les démonstratifs (זה, זאת…), ni une préposition
   suivie d'un nom (לדוד, של חנה), qui n'est pas déclinée.
Écris l'hébreu sans nikkoud ni lettre latine, et le français sans hébreu."""

Person = Literal[1, 2, 3]
Gender = Literal["m", "f"]
Number = Literal["sg", "pl"]


class Verb(BaseModel):
    he: str = Field(description="Le verbe conjugué accordé avec le sujet, tel qu'écrit")
    infinitive: str = Field(description="Son infinitif, vide pour צריך et יכול")


class Subject(BaseModel):
    he: str
    fr: str
    person: Person
    gender: Gender
    number: Number
    verbs: list[Verb]


class DeclinedPreposition(BaseModel):
    he: str
    base: str
    person: Person
    gender: Gender
    number: Number


class Utterance(BaseModel):
    number: int
    qualifies: bool
    subjects: list[Subject]
    declined_prepositions: list[DeclinedPreposition]


class Lesson(BaseModel):
    utterances: list[Utterance]


def check(text: str, u: Utterance) -> list[str]:
    problems = [f"sujet « {s.he} » absent" for s in u.subjects if s.he not in text]
    problems += [f"verbe « {v.he} » absent" for s in u.subjects for v in s.verbs if v.he not in text]
    problems += [f"sujet « {s.he} » sans verbe" for s in u.subjects if not s.verbs]
    problems += [f"préposition « {p.he} » absente" for p in u.declined_prepositions if p.he not in text]
    if not u.subjects and not u.declined_prepositions:
        problems.append("retenu sans sujet ni préposition déclinée")
    return problems


async def lesson_pool(client: AsyncOpenAI, code: str, items: list[tuple[str, str]]) -> dict[str, list[dict]]:
    response = await client.responses.parse(
        model=EVALUATOR["model"],
        reasoning={"effort": EVALUATOR["effort"]},
        input=[
            {"role": "system", "content": PROMPT},
            {"role": "user", "content": "\n".join(f"{i}. {text}" for i, (_, text) in enumerate(items, 1))},
        ],
        text_format=Lesson,
    )
    found = {u.number: u for u in response.output_parsed.utterances}
    problems = [f"énoncé {i} non analysé" for i in range(1, len(items) + 1) if i not in found]
    result: dict[str, list[dict]] = {}
    for i, (phrase_id, text) in enumerate(items, 1):
        u = found.get(i)
        if u and u.qualifies:
            problems += [f"{phrase_id} « {text} » : {p}" for p in check(text, u)]
            result.setdefault(phrase_id, []).append({
                "text": text,
                "subjects": [s.model_dump() for s in u.subjects],
                "declined_prepositions": [p.model_dump() for p in u.declined_prepositions],
            })
    kept = [u for v in result.values() for u in v]
    print(f"{code} : {len(items)} énoncés, {len(kept)} retenus, {sum(len(u['subjects']) for u in kept)} sujets, "
          f"{sum(len(u['declined_prepositions']) for u in kept)} prépositions déclinées, {len(problems)} anomalie(s)",
          flush=True)
    for problem in problems:
        print("   -", problem)
    return result


async def main(args: list[str]) -> None:
    output = OUTPUT
    if "--out" in args:
        i = args.index("--out")
        output, args = Path(args[i + 1]), args[:i] + args[i + 2:]
    with open(DATA_DIR / "revision_phrase_analysis.json", encoding="utf-8") as f:
        analysis = json.load(f)
    by_lesson: dict[str, list[tuple[str, str]]] = {}
    for phrase_id, items in analysis.items():
        by_lesson.setdefault(phrase_id.split(":")[0], []).extend((phrase_id, u["text"]) for u in items)
    codes = args or sorted(by_lesson)
    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    results = await asyncio.gather(*(lesson_pool(client, code, by_lesson[code]) for code in codes))
    pool = {phrase_id: items for result in results for phrase_id, items in result.items()}
    pool = dict(sorted(pool.items(), key=lambda kv: (kv[0].split(":")[0], int(kv[0].split(":")[1]))))
    output.write_text(json.dumps(pool, ensure_ascii=False, indent=4), encoding="utf-8")
    print(f"→ {output}")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
