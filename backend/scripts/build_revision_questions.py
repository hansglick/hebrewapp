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

PRONOUNS = {"אני", "אתה", "את", "הוא", "היא", "אנחנו", "אתם", "אתן", "הם", "הן"}

PROMPT = """Tu es professeur d'hébreu pour des francophones débutants. Exercice : l'élève voit une phrase hébraïque
(la réponse) et un indice en français, et doit poser à voix haute la question qui a cette phrase pour réponse.

Pour chaque phrase numérotée ci-dessous, propose de 0 à 3 questions. La qualité prime sur la quantité : mieux vaut
peu de questions, toutes pertinentes, que beaucoup de questions artificielles. Ne propose une question que si un
locuteur natif pourrait vraiment la poser dans une conversation, et que la phrase y répondrait naturellement ; si
aucune question naturelle ne mène à la phrase, n'en propose aucune (liste vide), c'est un résultat normal.
- La phrase doit être une réponse naturelle et complète à la question (un interlocuteur pourrait la dire telle quelle).
- Jamais de question « qui ? » (מי) sur un sujet qui n'est qu'un pronom personnel (הוא, היא, הם, אני…) : la
  réponse « lui » ou « elle » n'a aucun sens hors contexte (« הוא תלמיד, היא תלמידה. » → pas « מי תלמיד? »).
  « Qui ? » ne porte que sur une personne nommée (prénom, nom) : « דוד שומע מוזיקה. » → « מי שומע מוזיקה? ».
- La question porte sur une information présente dans la phrase (lieu, personne, objet, action, provenance,
  destination, raison, moment, quantité, manière…) ; chaque question proposée porte sur une information différente.
- La question reprend le verbe et les autres éléments de la phrase, seule l'information demandée est remplacée par
  le mot interrogatif : « הוא קורא ספר בכיתה. » → « איפה הוא קורא ספר? » (et non « איפה הוא? ») ;
  « אני באה לבקר בישראל באוגוסט » → « מתי את באה לבקר בישראל? ».
- La question commence par un mot interrogatif de la liste autorisée, éventuellement précédé d'une préposition
  (ex. עם מי, של מי, למי, במה) ; jamais de question fermée (oui / non).
- La question n'emploie que des mots, des verbes conjugués et des tournures du vocabulaire et des concepts fournis,
  plus les pronoms personnels et les prénoms de la phrase. Elle est grammaticalement correcte, sans nikkoud,
  et se termine par « ? ». Adapte la personne si besoin (la phrase dit « je », la question dit « tu »).
- L'indice est le groupe interrogatif traduit en français, court, en minuscules, terminé par « ? »
  (ex. « où ? », « avec qui ? », « quoi ? », « d'où ? », « à qui ? »). מה seul se traduit toujours « quoi ? »
  (jamais « qu'est-ce que ? » ni « que ? ») ; avec une préposition : « avec quoi ? » (במה), « sur quoi ? » (על מה)…
- Aucune question (liste vide) pour une phrase qui est déjà une question, une salutation, une exclamation,
  un titre, une phrase trop courte, ou dont toute question semblerait artificielle.

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


def natural(text: str, question: Question) -> bool:
    """Garde-fous après Sol (cf. demande explicite du user) : « מה » seul a pour indice « quoi ? », et pas de « qui ? »
    sur un sujet qui n'est qu'un pronom (« הוא תלמיד » → « מי תלמיד? » n'a pas de sens)."""
    if question.interrogative.strip() == "מה":
        question.hint = "quoi ?"
    first = text.replace(",", " ").split()[:1]
    return not (question.interrogative.strip() == "מי" and first and first[0] in PRONOUNS)


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
    found = {p.number: [q for q in p.questions if natural(items[p.number - 1]["text"], q)]
             for p in response.output_parsed.phrases if 1 <= p.number <= len(items)}
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
