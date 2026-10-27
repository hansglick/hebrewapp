"""Remplace, dans revision_phrase_analysis.json, la préposition et le pronom objet de chaque énoncé (une seule valeur,
celle du complément du verbe principal) par des listes : toutes les prépositions et tous les pronoms objets de l'énoncé
(cf. demande explicite du user). Sol (effort medium, un appel par leçon) relit chaque énoncé.

Les deux pools (revision_concept_pool.json, revision_svc_pool.json) sont ensuite réécrits à partir du fichier mis à
jour, sans changer les énoncés qu'ils contiennent.

Usage (depuis backend/) : .venv/Scripts/python.exe -m scripts.build_revision_prepositions
"""

import asyncio
import json
import re

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from app.config import DATA_DIR, OPENAI_API_KEY
from app.revision_agent.config import EVALUATOR

ANALYSIS = DATA_DIR / "revision_phrase_analysis.json"
POOLS = [DATA_DIR / "revision_concept_pool.json", DATA_DIR / "revision_svc_pool.json"]
NIQQUD = re.compile(r"[֑-ׇ]")

PROMPT = """Tu es un professeur d'hébreu et un linguiste spécialiste de la grammaire de l'hébreu israélien moderne.
Pour chaque énoncé numéroté, donne :
- prepositions : toutes les prépositions de l'énoncé, dans leur ordre d'apparition, en hébreu sans nikkoud :
  une lettre (ב, ל, מ, כ) même si elle est accolée au mot qu'elle introduit, y compris contractée avec l'article
  (בַּכִּתָּה → ב), ou un mot (את, עם, על, אל, של, אצל, אחרי, לפני, על יד…). La particule את devant un complément
  défini compte comme une préposition. Ne compte pas le ל de l'infinitif (ללמוד), le ו de coordination, l'article ה,
  le ש relatif, ni la préposition d'une forme déclinée (לי, אותו… : voir object_pronouns).
  Une préposition présente deux fois est écrite deux fois. Liste vide s'il n'y en a pas.
- object_pronouns : tous les pronoms personnels exprimés par une préposition déclinée (לי, לך, לו, לנו, אותו, אותה,
  ממני, איתו, עליו, שלי…), recopiés tels qu'ils sont écrits dans l'énoncé, dans leur ordre d'apparition,
  y compris dans les tournures sans verbe (יש לי, קר לי). Liste vide s'il n'y en a pas."""


class Utterance(BaseModel):
    number: int
    prepositions: list[str] = Field(description="Toutes les prépositions, sans nikkoud")
    object_pronouns: list[str] = Field(description="Toutes les prépositions déclinées, telles qu'écrites")


class Lesson(BaseModel):
    utterances: list[Utterance]


async def lesson_lists(client: AsyncOpenAI, code: str, items: list[dict]) -> list[Utterance | None]:
    response = await client.responses.parse(
        model=EVALUATOR["model"],
        reasoning={"effort": EVALUATOR["effort"]},
        input=[
            {"role": "system", "content": PROMPT},
            {"role": "user", "content": "\n".join(f"{i}. {u['text']}" for i, u in enumerate(items, 1))},
        ],
        text_format=Lesson,
    )
    found = {u.number: u for u in response.output_parsed.utterances}
    result = [found.get(i) for i in range(1, len(items) + 1)]
    problems = [f"énoncé {i} non analysé" for i, r in enumerate(result, 1) if r is None]
    for u, r in zip(items, result):
        if r:
            problems += [f"« {p} » absent de « {u['text']} »" for p in r.object_pronouns if p not in NIQQUD.sub("", u["text"])]
    print(f"{code} : {len(items)} énoncés, {len(problems)} anomalie(s)", flush=True)
    for problem in problems:
        print("   -", problem)
    return result


async def main() -> None:
    analysis = json.loads(ANALYSIS.read_text(encoding="utf-8"))
    by_lesson: dict[str, list[dict]] = {}
    for phrase_id, items in analysis.items():
        by_lesson.setdefault(phrase_id.split(":")[0], []).extend(items)
    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    codes = sorted(by_lesson)
    results = await asyncio.gather(*(lesson_lists(client, code, by_lesson[code]) for code in codes))

    for code, lists in zip(codes, results):
        for u, r in zip(by_lesson[code], lists):
            if r is None:  # pas de réponse : on garde l'ancienne valeur, en liste
                u["preposition"] = [u["preposition"]] if isinstance(u["preposition"], str) and u["preposition"] else []
                u["object_pronoun"] = ([p.strip() for p in u["object_pronoun"].split(",") if p.strip()]
                                       if isinstance(u["object_pronoun"], str) else u["object_pronoun"])
            else:
                u["preposition"] = [NIQQUD.sub("", p).strip() for p in r.prepositions if p.strip()]
                u["object_pronoun"] = [p.strip() for p in r.object_pronouns if p.strip()]
    ANALYSIS.write_text(json.dumps(analysis, ensure_ascii=False, indent=4), encoding="utf-8")

    # Les pools reprennent les énoncés mis à jour (même identifiant de phrase, même texte).
    updated = {(phrase_id, u["text"]): u for phrase_id, items in analysis.items() for u in items}
    for path in POOLS:
        pool = json.loads(path.read_text(encoding="utf-8"))
        pool = {phrase_id: [updated[(phrase_id, u["text"])] for u in items] for phrase_id, items in pool.items()}
        path.write_text(json.dumps(pool, ensure_ascii=False, indent=4), encoding="utf-8")
    print(f"→ {ANALYSIS}, {', '.join(p.name for p in POOLS)}")


if __name__ == "__main__":
    asyncio.run(main())
