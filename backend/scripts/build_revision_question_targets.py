"""Ajoute à chaque question de la tâche « Question » sa cible (« target ») : le mot ou la suite de mots de la phrase
qui porte l'information demandée (cf. demande explicite du user), en une liste de morceaux : un seul en général
(« אני גרה בתל אביב. » / « איפה את גרה? » → ["בתל אביב"]), un par élément demandé pour une question double
(« איפה אתה גר ואיפה אתה עובד? » → ["בתל אביב", "בחיפה"]). À l'écran, la cible restreint ce que l'élève doit
demander : il devine la question qui y mène.
Les questions de DROPPED, qui dépendent d'un contexte absent de la phrase, sont retirées des deux fichiers.

Sol (raisonnement medium) choisit la cible ; elle est recopiée telle quelle de la phrase (vérifié ici). On vérifie
aussi la personne miroir (cf. demande explicite du user) : une phrase à la 1re personne (אני, אנחנו) appelle une
question à la 2e (« tu », « vous ») ; un manquement est seulement signalé.
La cible est écrite dans revision_questions.json (la source, cf. build_revision_questions.py) et dans
revision_course.json (cf. build_revision_course.py, qui la recopie).

Usage (depuis backend/) : .venv/Scripts/python.exe -m scripts.build_revision_question_targets [leçon ...]
Sans argument, toutes les questions ; avec des codes (« 0.01 »), seulement celles de ces leçons.
"""

import asyncio
import json
import re
import sys

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from app.config import DATA_DIR, OPENAI_API_KEY
from app.revision_agent.config import EVALUATOR

COURSE = DATA_DIR / "revision_course.json"
QUESTIONS = DATA_DIR / "revision_questions.json"

FIRST_PERSON = {"אני", "אנחנו"}

# (phrase, question) impossibles à deviner de la phrase seule (cf. demande explicite du user).
DROPPED = {("0.20:5", "למה רק חמישה תלמידים באים לכיתה?")}

PROMPT = """Tu es professeur d'hébreu. Exercice : l'élève voit une phrase hébraïque où un groupe de mots est
surligné (la cible), et doit poser la question qui demande justement cette information, la phrase en étant la
réponse naturelle. Ex. « אני גרה בתל אביב. », cible « בתל אביב » → « איפה את גרה? ».

Pour chaque phrase numérotée ci-dessous, on te donne une question qui a cette phrase pour réponse. Donne la cible :
le mot ou la suite de mots de la phrase qui répond à la question, c'est-à-dire l'information que le mot interrogatif
remplace.
- Recopie la cible EXACTEMENT telle qu'elle est écrite dans la phrase (mêmes lettres, sans nikkoud), sans la
  ponctuation qui l'entoure. Elle tient en un seul morceau d'un seul tenant ; seule une question double (deux mots
  interrogatifs, « איפה … ואיפה … », « כמה … וכמה … ») en a deux, un par élément demandé, sans les mots entre eux :
  « אני גר בתל אביב ועובד בחיפה. » / « איפה אתה גר ואיפה אתה עובד? » → « בתל אביב », « בחיפה ».
- Garde les préfixes collés au mot (ב, ל, מ, ו) et les prépositions qui font partie de l'information :
  « למי דוד כותב מכתב? » → « לחנה » ; « איך אתה נוסע לעבודה? » → « ברכב » ; « מאיפה אתה? » → « מתל אביב ».
- Ni plus ni moins que l'information demandée : pas le verbe ni le sujet, sauf s'ils sont eux-mêmes demandés
  (« מי שומע מוזיקה? » → « דוד » ; « מה אתה כותב? » → « מכתב »).
"""


class Target(BaseModel):
    number: int
    target: list[str] = Field(description="Les morceaux de la phrase qui répondent à la question, recopiés "
                                          "exactement : un seul, deux pour une question double")


class Targets(BaseModel):
    targets: list[Target]


def words(text: str) -> list[str]:
    return re.findall(r"[א-ת\"'׳״]+", text)


def in_sentence(target: str, sentence: str) -> bool:
    """La cible est une suite de mots entiers de la phrase."""
    t, s = words(target), words(sentence)
    return bool(t) and any(s[i:i + len(t)] == t for i in range(len(s) - len(t) + 1))


def mirror_problem(sentence: str, question: str) -> str | None:
    """La phrase est à la 1re personne et la question aussi : il fallait « tu » / « vous »."""
    if FIRST_PERSON & set(words(sentence)) and FIRST_PERSON & set(words(question)):
        return f"personne miroir : « {sentence} » → « {question} »"
    return None


async def lesson_targets(client: AsyncOpenAI, code: str, items: list[tuple[str, str]]) -> dict[int, list[str]]:
    """Cibles des couples (phrase, question) de la leçon, par numéro (à partir de 1) ; on redemande une fois celles
    qui ne sont pas recopiées de la phrase."""
    found: dict[int, list[str]] = {}
    todo = list(range(1, len(items) + 1))
    for attempt in range(2):
        if not todo:
            break
        response = await client.responses.parse(
            model=EVALUATOR["model"],
            reasoning={"effort": EVALUATOR["effort"]},
            input=[
                {"role": "system", "content": PROMPT},
                {"role": "user", "content": "\n".join(
                    f"{n}. Phrase : {items[n - 1][0]}\n   Question : {items[n - 1][1]}" for n in todo)},
            ],
            text_format=Targets,
        )
        for t in response.output_parsed.targets:
            if t.number in todo and 1 <= len(t.target) <= 2 and all(in_sentence(piece, items[t.number - 1][0])
                                                                    for piece in t.target):
                found[t.number] = [" ".join(words(piece)) for piece in t.target]
        todo = [n for n in todo if n not in found]
    for n in todo:
        print(f"  {code} : pas de cible pour « {items[n - 1][1]} » ({items[n - 1][0]})", flush=True)
    print(f"{code} : {len(found)}/{len(items)} cibles", flush=True)
    return found


async def main(codes: list[str]) -> None:
    course = json.loads(COURSE.read_text(encoding="utf-8"))
    by_lesson: dict[str, list[tuple[str, dict, dict]]] = {}
    for phrase_id, p in course["phrases"].items():
        if codes and p["lesson"] not in codes:
            continue
        for u in p["utterances"]:
            u["questions"] = [q for q in u["questions"] if (phrase_id, q["he"]) not in DROPPED]
            for q in u["questions"]:
                by_lesson.setdefault(p["lesson"], []).append((phrase_id, u, q))

    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    lessons = sorted(by_lesson)
    results = await asyncio.gather(*(
        lesson_targets(client, code, [(u["he"], q["he"]) for _, u, q in by_lesson[code]]) for code in lessons))

    targets: dict[tuple[str, str, str], list[str]] = {}
    for code, found in zip(lessons, results):
        for n, (phrase_id, u, q) in enumerate(by_lesson[code], 1):
            if problem := mirror_problem(u["he"], q["he"]):
                print(f"  {code} : {problem}")
            if n in found:
                q["target"] = found[n]
                targets[(phrase_id, u["he"], q["he"])] = found[n]
    COURSE.write_text(json.dumps(course, ensure_ascii=False, indent=1), encoding="utf-8")

    source = json.loads(QUESTIONS.read_text(encoding="utf-8"))
    for phrase_id, entries in source.items():
        for entry in entries:
            entry["questions"] = [q for q in entry["questions"] if (phrase_id, q["question"]) not in DROPPED]
            for q in entry["questions"]:
                if (target := targets.get((phrase_id, entry["text"], q["question"]))) is not None:
                    q["target"] = target
    QUESTIONS.write_text(json.dumps(source, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(targets)} cibles → {COURSE.name}, {QUESTIONS.name}")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
