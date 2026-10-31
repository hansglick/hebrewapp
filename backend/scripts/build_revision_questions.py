"""Prépare la tâche « Question » de /dev/revision-agent : pour chaque affirmation des leçons 0.01 → 0.20
(revision_phrase_analysis.json), Sol imagine des questions plausibles qui ont cette phrase pour réponse, chacune avec
son indice (le groupe interrogatif en français). Leçons 0.01 → 0.20 : les questions n'employaient que la matière
(mots, verbes, concepts) des leçons ≤ celle de la phrase ; au-delà (cf. demande explicite du user), la question
reprend simplement le vocabulaire de la phrase, avec n'importe quel mot interrogatif courant.
Résultat : data/revision_questions.json, {identifiant de phrase: [{"text": énoncé, "questions": [{"hint", "question",
"interrogative"}]}]} ; les leçons données remplacent les leurs, les autres restent.

Usage (depuis backend/) : .venv/Scripts/python.exe -m scripts.build_revision_questions 0.21-0.30
"""

import asyncio
import json
import sys

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from app.config import DATA_DIR, OPENAI_API_KEY
from app.revision_agent.config import EVALUATOR
from scripts.revision_scope import merge_phrases, parse_lessons

OUTPUT = DATA_DIR / "revision_questions.json"
POOLS = ("revision_concept_pool.json", "revision_svc_pool.json")

# Mots interrogatifs courants : tous vus à la leçon 0.15 (item_word, et le concept 0.15 pour les autres), donc tous
# permis au-delà de 0.20 (cf. demande explicite du user).
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
    (15, "איזה / איזו / אילו", "quel ? / quelle ? / quels ?"),
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
- La question reprend le vocabulaire de la phrase (mots, verbes, prénoms) ; elle n'ajoute que le mot interrogatif
  et, si besoin, les pronoms, prépositions et mots grammaticaux qui la rendent correcte. Elle est grammaticalement
  correcte, sans nikkoud, et se termine par « ? ». Adapte la personne si besoin (la phrase dit « je », la question
  dit « tu »).
- L'indice est le groupe interrogatif traduit en français, court, en minuscules, terminé par « ? »
  (ex. « où ? », « avec qui ? », « quoi ? », « d'où ? », « à qui ? »). מה seul se traduit toujours « quoi ? »
  (jamais « qu'est-ce que ? » ni « que ? ») ; avec une préposition : « avec quoi ? » (במה), « sur quoi ? » (על מה)…
- Aucune question (liste vide) pour une phrase qui est déjà une question, une salutation, une exclamation,
  un titre, un simple groupe nominal sans verbe ni prédicat (« משפחת כהן », « בית הספר של דוד »), une phrase trop
  courte, ou dont toute question semblerait artificielle.

Mots interrogatifs autorisés :
{interrogatives}"""


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


def utterances() -> list[tuple[str, dict]]:
    """(leçon, énoncé) pour chaque énoncé des deux pools, une seule fois, l'énoncé complété de l'identifiant de sa
    phrase."""
    found, seen = [], set()
    for name in POOLS:
        pool = json.loads((DATA_DIR / name).read_text(encoding="utf-8"))
        for phrase_id, items in pool.items():
            for u in items:
                if (phrase_id, u["text"]) not in seen:
                    seen.add((phrase_id, u["text"]))
                    found.append((phrase_id.split(":")[0], {**u, "id": phrase_id}))
    return found


async def lesson_questions(client: AsyncOpenAI, code: str, items: list[dict]) -> dict[str, list[dict]]:
    prompt = PROMPT.format(interrogatives="\n".join(f"- {he} : {fr}" for _, he, fr in INTERROGATIVES))
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


async def main(args: list[str]) -> None:
    codes = parse_lessons(args)
    by_lesson: dict[str, list[dict]] = {}
    for code, u in utterances():
        by_lesson.setdefault(code, []).append(u)
    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    results = await asyncio.gather(*(lesson_questions(client, code, by_lesson[code]) for code in codes
                                     if code in by_lesson))
    merge_phrases(OUTPUT, {phrase_id: items for result in results for phrase_id, items in result.items()}, codes, 1)


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
