"""Analyse grammaticale des phrases des leçons (repris de livecoach/samples/phrase_analysis.py, qui a produit les leçons
0.01 → 0.20) : chaque phrase de item_phrase.json est découpée par le code en énoncés, une réplique par tiret de
dialogue, une phrase par ponctuation finale (. ? !), sans le nom du locuteur (« דוד: »). Pour chaque énoncé, Sol
(EVALUATOR, un appel par leçon) donne :
- les concepts de grammaire dont il est un bon exemple, avec les mots qui les illustrent : seulement les concepts
  retenus (cf. build_revision_concept_pool), des leçons L-10 → L+10 (cf. scripts.revision_scope) ;
- l'action principale (verbe à l'infinitif et compléments généralisés), en français et en hébreu ;
- le sujet principal, en français et en hébreu ;
- la préposition du complément du verbe et le pronom objet (préposition déclinée), en listes comme le reste du
  fichier (cf. build_revision_prepositions, qui n'est plus lancé).
Résultat : data/revision_phrase_analysis.json, {« 0.21:1 »: [énoncé, énoncé…]} (identifiant de item_phrase) ; les
leçons données remplacent les leurs, les autres restent.

Usage (depuis backend/) : .venv/Scripts/python.exe -m scripts.build_revision_phrase_analysis 0.21-0.30
"""

import asyncio
import json
import re
import sys

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from app.config import DATA_DIR, OPENAI_API_KEY
from app.data_loader import get_dataset
from app.revision_agent.config import EVALUATOR
from scripts.build_revision_concept_pool import lesson_catalog
from scripts.revision_scope import merge_phrases, parse_lessons

OUTPUT = DATA_DIR / "revision_phrase_analysis.json"
NIQQUD = re.compile(r"[֑-ׇ]")
HEBREW_LETTER = re.compile(r"[א-ת]")
TURN = re.compile(r"(?:^|(?<=[.?!]))\s*-\s*")  # tiret qui ouvre une réplique : en début de texte ou après . ? !
SPEAKER = re.compile(r"^[א-ת ]{1,20}:\s*")  # « דוד: », « חנה ודוד: »
SENTENCE_END = re.compile(r"(?<=[.?!])\s+")

PROMPT = """Tu es un professeur d'hébreu et un linguiste spécialiste de la grammaire de l'hébreu israélien moderne.
On te donne les énoncés d'une leçon d'hébreu pour débutants francophones, chacun avec un identifiant,
et des concepts de grammaire du cours proches de cette leçon (identifiant, intitulé, explication).

Pour chaque énoncé, donne :
- concepts : les concepts dont l'énoncé est un bon exemple, c'est-à-dire qu'il met en avant le point de grammaire
  du concept ; ne retiens pas un concept simplement parce que l'énoncé contient un verbe au présent ou un pronom.
  La liste peut être vide. Pour chaque concept, words : les mots de l'énoncé qui l'illustrent, recopiés exactement
  tels qu'ils sont écrits (un groupe de mots est permis, ex. « יש לי »).
- action_fr, action_he : l'action principale, c'est-à-dire le verbe principal à l'infinitif et ses compléments,
  généralisés : quelqu'un / מישהו, quelque chose / משהו, quelque part / למקום כלשהו ou במקום כלשהו.
  Ex. : « דוד מספר לתלמידים מאיפה הוא בא » → « raconter quelque chose à quelqu'un » / « לספר משהו למישהו ».
  Avec un verbe modal (צריך, יכול, רוצה) suivi d'un infinitif, l'action comprend le modal :
  « pouvoir donner quelque chose à quelqu'un » / « יכול לתת משהו למישהו ».
  Si l'énoncé n'a pas de verbe (phrase nominale, יש, אין, קר לי…), laisse les deux champs vides.
- subject_fr, subject_he : le sujet principal, en hébreu tel qu'il est écrit dans l'énoncé (pronom ou nom)
  et sa traduction ; vides si le sujet est implicite ou si la tournure est impersonnelle (קר לי, יש ספר).
- preposition : la préposition qui introduit le complément du verbe principal, en hébreu : une lettre (ל, ב, מ, כ)
  même si elle est accolée au complément, ou un mot (את, עם, על, אל…). La particule את devant un complément
  défini compte comme une préposition. Vide si le verbe n'a pas de complément introduit par une préposition,
  ou s'il n'y a pas de verbe.
- object_pronoun : le pronom personnel exprimé par une préposition déclinée (לי, לך, לו, לנו, אותו, אותה, ממני,
  איתו, עליו…), recopié tel qu'il est écrit, y compris dans les tournures sans verbe (יש לי, קר לי). Vide sinon.

Écris le français sans hébreu, et l'hébreu sans nikkoud ni lettre latine. N'utilise que les identifiants de concepts donnés."""


class ConceptLink(BaseModel):
    id: str = Field(description="Identifiant du concept")
    words: list[str] = Field(description="Mots de l'énoncé qui illustrent le concept, recopiés exactement")


class UtteranceAnalysis(BaseModel):
    id: str
    concepts: list[ConceptLink]
    action_fr: str
    action_he: str
    subject_fr: str
    subject_he: str
    preposition: str
    object_pronoun: str


class LessonAnalysis(BaseModel):
    utterances: list[UtteranceAnalysis]


def split_utterances(hebrew: str) -> list[str]:
    """Une réplique par tiret de dialogue, une phrase par ponctuation finale, sans le nom du locuteur."""
    utterances = []
    for turn in TURN.split(hebrew):
        for sentence in SENTENCE_END.split(SPEAKER.sub("", turn.strip())):
            if HEBREW_LETTER.search(sentence):
                utterances.append(sentence.strip())
    return utterances


def check(analysis: LessonAnalysis, texts: dict[str, str], concepts: dict[str, tuple[str, str]]) -> list[str]:
    """Anomalies : énoncés manquants ou en double, concepts inconnus, mots ou pronoms absents de l'énoncé."""
    problems = []
    seen = [u.id for u in analysis.utterances]
    problems += [f"énoncé non analysé : {i}" for i in texts if i not in seen]
    problems += [f"énoncé inconnu ou en double : {i}" for i in set(seen) if i not in texts or seen.count(i) > 1]
    for u in analysis.utterances:
        text = NIQQUD.sub("", texts.get(u.id, ""))
        for link in u.concepts:
            if link.id not in concepts:
                problems.append(f"{u.id} : concept hors fenêtre ou inconnu « {link.id} »")
            problems += [f"{u.id} : « {w} » ({link.id}) n'est pas dans l'énoncé" for w in link.words if w not in text]
        problems += [f"{u.id} : pronom objet « {p} » absent de l'énoncé" for p in listed(u.object_pronoun)
                     if p not in text]
    return problems


def listed(text: str) -> list[str]:
    return [p.strip() for p in NIQQUD.sub("", text).split(",") if p.strip()]


async def lesson_analysis(client: AsyncOpenAI, code: str) -> dict[str, list[dict]]:
    texts, by_phrase = {}, {}
    for i, phrase in enumerate(get_dataset("phrase")[code]):
        ids = []
        for n, utterance in enumerate(split_utterances(phrase["hebrew"])):
            texts[f"{code}:{i}/{n}"] = utterance
            ids.append(f"{code}:{i}/{n}")
        by_phrase[f"{code}:{i}"] = ids
    concepts = lesson_catalog(code)
    message = ("Énoncés :\n" + "\n".join(f"{i} : {t}" for i, t in texts.items())
               + "\n\nConcepts :\n" + "\n".join(f"- {k} | {d} | {e}" for k, (d, e) in concepts.items()))
    response = await client.responses.parse(
        model=EVALUATOR["model"],
        reasoning={"effort": EVALUATOR["effort"]},
        input=[{"role": "system", "content": PROMPT}, {"role": "user", "content": message}],
        text_format=LessonAnalysis,
    )
    analysis = response.output_parsed
    problems = check(analysis, texts, concepts)
    print(f"{code} : {len(by_phrase)} phrases, {len(texts)} énoncés, {len(concepts)} concepts, "
          f"{len(problems)} anomalie(s)", flush=True)
    for problem in problems:
        print("   -", problem)
    results = {u.id: u for u in analysis.utterances}
    return {phrase_id: [{
        "text": texts[i],
        "concepts": [{"id": c.id, "words": c.words} for c in results[i].concepts if c.id in concepts],
        "action": {"fr": results[i].action_fr, "he": results[i].action_he},
        "subject": {"fr": results[i].subject_fr, "he": results[i].subject_he},
        "preposition": listed(results[i].preposition),
        "object_pronoun": listed(results[i].object_pronoun),
    } for i in ids if i in results] for phrase_id, ids in by_phrase.items()}


async def main(args: list[str]) -> None:
    codes = parse_lessons(args)
    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    results = await asyncio.gather(*(lesson_analysis(client, code) for code in codes))
    merge_phrases(OUTPUT, {phrase_id: items for result in results for phrase_id, items in result.items()}, codes, 4)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    asyncio.run(main(sys.argv[1:]))
