"""Ajoute aux énoncés des deux pools (revision_concept_pool.json, revision_svc_pool.json) qui ne sont pas des questions
(pas de « ? ») les questions qu'on aurait pu poser pour obtenir l'énoncé en guise de réponse (cf. demande explicite du
user). Sol (effort medium, un appel par leçon) juge d'abord si une question y mène naturellement : 0 à 2 questions
ouvertes par énoncé, chacune avec son groupe interrogatif en français.

Champ ajouté à chaque énoncé qui n'est pas une question : "questions": [{"question": hébreu, "interrogative": français}].

Usage (depuis backend/) : .venv/Scripts/python.exe -m scripts.build_revision_pool_questions
"""

import asyncio
import json

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from app.config import DATA_DIR, OPENAI_API_KEY
from app.revision_agent.config import EVALUATOR

POOLS = [DATA_DIR / "revision_concept_pool.json", DATA_DIR / "revision_svc_pool.json"]
MAX_QUESTIONS = 2

PROMPT = """Tu es professeur d'hébreu. Pour chaque énoncé hébreu numéroté, imagine les questions qu'un interlocuteur
aurait pu poser pour obtenir cet énoncé en guise de réponse.
1. Juge d'abord si une question y mène naturellement : l'énoncé doit être une réponse relativement naturelle et
   complète à la question, telle qu'on pourrait la dire dans une vraie conversation. Si ce n'est pas le cas
   (salutation, formule, exclamation, fragment, réponse « oui / non » à une question fermée, phrase qui ne répond
   naturellement à rien…), ne propose aucune question.
2. Sinon, propose 1 ou 2 questions, chacune portant sur une information différente de l'énoncé :
   - uniquement des questions ouvertes, introduites par un mot interrogatif (éventuellement précédé d'une préposition) ;
     jamais de question fermée (oui / non) ;
   - la question reprend le verbe et les autres éléments de l'énoncé, seule l'information demandée est remplacée par
     le mot interrogatif ; adapte la personne si besoin (l'énoncé dit « je », la question dit « tu ») ;
   - en hébreu correct, sans nikkoud, terminée par « ? ».
   Ne propose une deuxième question que si elle est aussi naturelle que la première.
Pour chaque question, donne aussi son groupe interrogatif traduit en français, court, en minuscules, terminé par « ? »
(ex. « où ? », « avec qui ? », « qu'est-ce que ? », « pourquoi ? », « à quelle heure ? »)."""


class Question(BaseModel):
    question: str = Field(description="La question en hébreu, sans nikkoud, terminée par « ? »")
    interrogative: str = Field(description="Le groupe interrogatif en français, ex. « avec qui ? »")


class Utterance(BaseModel):
    number: int
    questions: list[Question] = Field(description="0 à 2 questions ouvertes ; liste vide si aucune n'est naturelle")


class Lesson(BaseModel):
    utterances: list[Utterance]


async def lesson_questions(client: AsyncOpenAI, code: str, items: list[dict]) -> list[list[dict]]:
    response = await client.responses.parse(
        model=EVALUATOR["model"],
        reasoning={"effort": EVALUATOR["effort"]},
        input=[
            {"role": "system", "content": PROMPT},
            {"role": "user", "content": "\n".join(f"{i}. {u['text']}" for i, u in enumerate(items, 1))},
        ],
        text_format=Lesson,
    )
    found = {u.number: u.questions for u in response.output_parsed.utterances}
    missing = [i for i in range(1, len(items) + 1) if i not in found]
    print(f"{code} : {len(items)} énoncés, {sum(len(q) for q in found.values())} questions"
          + (f", non analysés : {missing}" if missing else ""), flush=True)
    return [[q.model_dump() for q in found.get(i, [])][:MAX_QUESTIONS] for i in range(1, len(items) + 1)]


async def main() -> None:
    pools = {path: json.loads(path.read_text(encoding="utf-8")) for path in POOLS}
    by_lesson: dict[str, list[dict]] = {}
    for pool in pools.values():
        for phrase_id, items in pool.items():
            by_lesson.setdefault(phrase_id.split(":")[0], []).extend(u for u in items if "?" not in u["text"])
    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    codes = sorted(by_lesson)
    results = await asyncio.gather(*(lesson_questions(client, code, by_lesson[code]) for code in codes))
    for code, questions in zip(codes, results):
        for u, q in zip(by_lesson[code], questions):
            u["questions"] = q  # les énoncés sont ceux des pools : modifiés sur place
    for path, pool in pools.items():
        path.write_text(json.dumps(pool, ensure_ascii=False, indent=4), encoding="utf-8")
    print(f"→ {', '.join(p.name for p in POOLS)}")


if __name__ == "__main__":
    asyncio.run(main())
