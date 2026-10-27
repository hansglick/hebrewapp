"""Ajoute à revision_questions.json des questions avec accord (איזה / איזו / אילו + nom), presque absentes de la
génération d'origine (cf. demande explicite du user) : pour chaque affirmation des leçons 0.01 → 0.20, Sol propose
au plus une question dont l'énoncé est la réponse naturelle, en interrogeant un nom de l'énoncé avec איזה / איזו /
אילו, accordé en genre et en nombre. Le niveau de l'énoncé n'est pas pris en compte.

Les questions sont ajoutées à celles de l'énoncé, au même format ({"hint", "question", "interrogative"}) ; relancer
le script remplace les questions d'accord déjà ajoutées.

Usage (depuis backend/) : .venv/Scripts/python.exe -m scripts.build_revision_agreement_questions
"""

import asyncio
import json
import re

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from app.config import DATA_DIR, OPENAI_API_KEY
from app.revision_agent.config import EVALUATOR

QUESTIONS = DATA_DIR / "revision_questions.json"
AGREEMENT = re.compile(r"(?<![א-ת])(?:[בלמ]?)(?:איזה|איזו|אילו)(?![א-ת])")

PROMPT = """Tu es professeur d'hébreu pour des francophones débutants. Exercice : l'élève voit une phrase hébraïque
(la réponse) et un indice en français, et doit poser à voix haute la question qui a cette phrase pour réponse.

On veut faire pratiquer l'accord des adjectifs interrogatifs : איזה (masculin singulier), איזו (féminin singulier),
אילו (pluriel), suivis du nom sur lequel porte la question, avec lequel ils s'accordent en genre et en nombre.
Pour chaque phrase numérotée, propose au plus UNE question de ce type :
- elle interroge un nom de la phrase, défini ou précisé par la phrase (« אני קורא את הספר החדש » → « איזה ספר
  אתה קורא? » ; « אני הכי אוהבת את העיר ירושלים » → « איזו עיר את הכי אוהבת? ») ; la phrase doit en être une réponse
  naturelle et complète ;
- איזה / איזו / אילו est suivi du nom, et précédé si besoin de la préposition qui introduit ce nom dans la phrase
  (« באיזו עיר », « לאיזה בית ») ;
- la question reprend le verbe et les autres éléments de la phrase ; adapte la personne si besoin (la phrase dit
  « je », la question dit « tu ») ; en hébreu correct, sans nikkoud, terminée par « ? » ;
- aucune question si la phrase ne contient pas de nom qu'on interrogerait naturellement ainsi (beaucoup de phrases
  n'en ont pas : ne force jamais).
Pour chaque question, donne :
- interrogative : le groupe interrogatif hébreu tel qu'il apparaît dans la question (ex. « איזה ספר », « באיזו עיר ») ;
- hint : ce groupe traduit en français, court, en minuscules, terminé par « ? » (ex. « quel livre ? », « dans quelle
  ville ? »)."""


class Question(BaseModel):
    hint: str
    question: str = Field(description="La question en hébreu, sans nikkoud, terminée par « ? »")
    interrogative: str = Field(description="Le groupe interrogatif hébreu, ex. « איזה ספר »")


class Utterance(BaseModel):
    number: int
    question: Question | None


class Lesson(BaseModel):
    utterances: list[Utterance]


async def lesson_questions(client: AsyncOpenAI, code: str, items: list[dict]) -> list[Question | None]:
    response = await client.responses.parse(
        model=EVALUATOR["model"],
        reasoning={"effort": EVALUATOR["effort"]},
        input=[
            {"role": "system", "content": PROMPT},
            {"role": "user", "content": "\n".join(f"{i}. {u['text']}" for i, u in enumerate(items, 1))},
        ],
        text_format=Lesson,
    )
    found = {u.number: u.question for u in response.output_parsed.utterances}
    result = []
    for i, u in enumerate(items, 1):
        q = found.get(i)
        if q and not AGREEMENT.search(q.interrogative):
            print(f"   - {code} « {u['text']} » : question écartée, sans איזה / איזו / אילו : {q.question}")
            q = None
        result.append(q)
    print(f"{code} : {len(items)} affirmations, {sum(q is not None for q in result)} questions d'accord", flush=True)
    return result


async def main() -> None:
    data = json.loads(QUESTIONS.read_text(encoding="utf-8"))
    by_lesson: dict[str, list[dict]] = {}
    for phrase_id, entries in data.items():
        for entry in entries:
            entry["questions"] = [q for q in entry["questions"] if not AGREEMENT.search(q["interrogative"])]
            if "?" not in entry["text"]:
                by_lesson.setdefault(phrase_id.split(":")[0], []).append(entry)
    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    codes = sorted(by_lesson)
    results = await asyncio.gather(*(lesson_questions(client, code, by_lesson[code]) for code in codes))
    for code, questions in zip(codes, results):
        for entry, q in zip(by_lesson[code], questions):
            if q:
                entry["questions"].append(q.model_dump())
    QUESTIONS.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"→ {QUESTIONS}")


if __name__ == "__main__":
    asyncio.run(main())
