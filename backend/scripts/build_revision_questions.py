"""Prépare la tâche « Question » de /dev/revision-agent : pour chaque affirmation des leçons 0.01 → 0.20
(revision_phrase_analysis.json), Sol imagine des questions plausibles qui ont cette phrase pour réponse, chacune avec
son indice (le groupe interrogatif en français). Les questions n'emploient que la matière (mots, verbes, concepts,
mots interrogatifs) des leçons ≤ celle de la phrase. Résultat : data/revision_questions.json,
{identifiant de phrase: [{"text": énoncé, "questions": [{"hint", "question", "interrogative"}]}]}.

Usage (depuis backend/) : .venv/Scripts/python.exe -m scripts.build_revision_questions [leçon ...]
Sans argument, toutes les leçons ; avec des codes (« 0.01 »), seulement celles-là, fusionnées dans le fichier existant.
"""

import asyncio
import json
import sys

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from app.config import DATA_DIR, OPENAI_API_KEY
from app.revision_agent.completion import concept_title
from app.revision_agent.config import EVALUATOR, LAST_LESSON
from app.revision_agent.material import vocabulary
from app.revision_agent.utterances import utterances

OUTPUT = DATA_DIR / "revision_questions.json"

# Mots interrogatifs et leçon où ils apparaissent (item_word, et le concept 0.15 pour les autres).
INTERROGATIVES = [
    (1, "מה", "quoi ? / que ?"),
    (1, "מי", "qui ?"),
    (1, "איפה", "où ?"),
    (2, "מאיפה", "d'où ?"),
    (4, "לאן", "(vers) où ?"),
    (15, "למה", "pourquoi ?"),
    (15, "מתי", "quand ?"),
    (15, "כמה", "combien ?"),
    (15, "איך", "comment ?"),
    (15, "איזה / איזו", "quel ? / quelle ?"),
]

PROMPT = """Tu es professeur d'hébreu pour des francophones débutants. Exercice : l'élève voit une phrase hébraïque
(la réponse) et un indice en français, et doit poser à voix haute la question qui a cette phrase pour réponse.

Pour chaque phrase numérotée ci-dessous, propose de 0 à 3 questions :
- La phrase doit être une réponse naturelle et complète à la question (un interlocuteur pourrait la dire telle quelle).
- La question porte sur une information présente dans la phrase (lieu, personne, objet, action, provenance,
  destination, raison, moment, quantité, manière…) ; chaque question proposée porte sur une information différente.
- La question reprend le verbe et les autres éléments de la phrase, seule l'information demandée est remplacée par
  le mot interrogatif : « הוא קורא ספר בכיתה. » → « איפה הוא קורא ספר? » (et non « איפה הוא? ») ;
  « אני באה לבקר בישראל באוגוסט » → « מתי את באה לבקר בישראל? ».
- Toute affirmation, même très simple (« רוני קורא עיתון. » → « מה רוני קורא? »), reçoit au moins une question.
- La question commence par un mot interrogatif de la liste autorisée, éventuellement précédé d'une préposition
  (ex. עם מי, של מי, למי, במה) ; jamais de question fermée (oui / non).
- La question n'emploie que des mots, des verbes conjugués et des tournures du vocabulaire et des concepts fournis,
  plus les pronoms personnels et les prénoms de la phrase. Elle est grammaticalement correcte, sans nikkoud,
  et se termine par « ? ». Adapte la personne si besoin (la phrase dit « je », la question dit « tu »).
- L'indice est le groupe interrogatif traduit en français, court, en minuscules, terminé par « ? »
  (ex. « où ? », « avec qui ? », « qu'est-ce que ? », « d'où ? », « à qui ? »).
- Aucune question (liste vide) pour une phrase qui est déjà une question, une salutation, une exclamation,
  un titre ou une phrase trop courte pour qu'une question naturelle y mène.

Mots interrogatifs autorisés :
{interrogatives}

Concepts étudiés :
{concepts}

Vocabulaire (mots puis verbes à l'infinitif) :
{vocabulary}"""


class Question(BaseModel):
    hint: str = Field(description="Le groupe interrogatif en français, ex. « avec qui ? »")
    question: str = Field(description="La question en hébreu, sans nikkoud, terminée par « ? »")
    interrogative: str = Field(description="Le groupe interrogatif hébreu tel qu'il apparaît dans la question")


class PhraseQuestions(BaseModel):
    number: int
    questions: list[Question]


class LessonQuestions(BaseModel):
    phrases: list[PhraseQuestions]


async def lesson_questions(client: AsyncOpenAI, code: str, items: list[dict]) -> dict[str, list[dict]]:
    level = int(code.split(".")[1])
    prompt = PROMPT.format(
        interrogatives="\n".join(f"- {he} : {fr}" for n, he, fr in INTERROGATIVES if n <= level),
        concepts="\n".join(f"- {title}" for n in range(1, level + 1) if (title := concept_title(f"0.{n:02d}"))),
        vocabulary="\n".join(f"- {w['hebrew']} : {w['french']}" for w in vocabulary(code, True, True)),
    )
    response = await client.responses.parse(
        model=EVALUATOR["model"],
        reasoning={"effort": EVALUATOR["effort"]},
        input=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": "\n".join(f"{i}. {u['text']}" for i, u in enumerate(items, 1))},
        ],
        text_format=LessonQuestions,
    )
    found = {p.number: p.questions for p in response.output_parsed.phrases}
    result: dict[str, list[dict]] = {}
    for i, u in enumerate(items, 1):
        result.setdefault(u["id"], []).append({
            "text": u["text"], "questions": [q.model_dump() for q in found.get(i, [])],
        })
    print(f"{code} : {len(items)} énoncés, {sum(len(q) for q in found.values())} questions", flush=True)
    return result


async def main(codes: list[str]) -> None:
    by_lesson: dict[str, list[dict]] = {}
    for code, u in utterances():
        by_lesson.setdefault(code, []).append(u)
    codes = codes or [f"0.{n:02d}" for n in range(1, LAST_LESSON + 1) if f"0.{n:02d}" in by_lesson]
    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    results = await asyncio.gather(*(lesson_questions(client, code, by_lesson[code]) for code in codes))

    data = json.loads(OUTPUT.read_text(encoding="utf-8")) if OUTPUT.exists() and sys.argv[1:] else {}
    for result in results:
        data.update(result)
    data = dict(sorted(data.items(), key=lambda kv: (kv[0].split(":")[0], int(kv[0].split(":")[1]))))
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"→ {OUTPUT}")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
