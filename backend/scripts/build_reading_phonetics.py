"""Prépare la prononciation attendue de chaque réplique des textes de lecture (tâche « Lecture », cf. demande explicite
du user) : sa transcription phonétique en lettres latines, avec la convention du prof (phonetics.PHONETIC_CONVENTION),
et le texte avec tous ses nikkoud. Le nom du personnage en tête d'une réplique (« דוד: ») n'est pas lu, il est retiré.

Sol (raisonnement medium), un appel par leçon ; on vérifie qu'il y a autant de mots latins que de mots hébreux.
Écrit dans data/revision_reading_phonetics.json : {leçon: [{"phonetic", "pointed"}, …]}, une entrée par réplique.

Usage (depuis backend/) : .venv/Scripts/python.exe -m scripts.build_reading_phonetics [leçon ...]
Sans argument, tous les textes du périmètre ; avec des codes (« 0.05 »), seulement ceux-là (les autres sont gardés).
"""

import asyncio
import json
import re
import sys

from openai import AsyncOpenAI
from pydantic import BaseModel

from app.config import OPENAI_API_KEY
from app.data_loader import get_dataset
from app.revision_agent.config import EVALUATOR
from app.revision_agent.passages import lessons_with_text
from app.revision_agent.phonetics import PHONETIC_CONVENTION, READING_PHONETICS
from app.revision_agent.reading import spoken

PROMPT = f"""Tu es professeur d'hébreu. Pour chaque phrase numérotée d'un texte de manuel pour débutants, donne :
- pointed : la phrase avec tous ses nikkoud, telle qu'elle se lit dans ce contexte ;
- phonetic : sa prononciation standard en hébreu moderne israélien, selon la convention ci-dessous.

{PHONETIC_CONVENTION}

Exemple : « הוא לומד עברית באולפן. » → pointed « הוּא לוֹמֵד עִבְרִית בָּאוּלְפָּן. », phonetic « hu lomed ivrit ba-ulpan »."""


class Phrase(BaseModel):
    number: int
    pointed: str
    phonetic: str


class Phrases(BaseModel):
    phrases: list[Phrase]


def hebrew_words(text: str) -> int:
    return len(re.findall(r"[א-ת][א-ת֑-ׇ\"'׳״]*", text))


async def lesson_phonetics(client: AsyncOpenAI, code: str, phrases: list[str]) -> list[dict] | None:
    for attempt in range(2):
        response = await client.responses.parse(
            model=EVALUATOR["model"],
            reasoning={"effort": EVALUATOR["effort"]},
            input=[{"role": "system", "content": PROMPT},
                   {"role": "user", "content": "\n".join(f"{n}. {p}" for n, p in enumerate(phrases, 1))}],
            text_format=Phrases,
        )
        found = {p.number: p for p in response.output_parsed.phrases}
        result, problems = [], []
        for n, phrase in enumerate(phrases, 1):
            p = found.get(n)
            if not p:
                problems.append(f"{n} manquante")
                continue
            if len(p.phonetic.split()) != hebrew_words(phrase):
                problems.append(f"{n} : {len(p.phonetic.split())} mots pour {hebrew_words(phrase)} ({p.phonetic})")
            result.append({"phonetic": p.phonetic.strip().lower(), "pointed": p.pointed.strip()})
        if not problems:
            print(f"{code} : {len(result)} répliques", flush=True)
            return result
        print(f"  {code} (essai {attempt + 1}) : {'; '.join(problems)}", flush=True)
    print(f"{code} : gardé malgré tout", flush=True)
    return result if len(result) == len(phrases) else None


async def main(codes: list[str]) -> None:
    texts = get_dataset("text")
    lessons = [code for code in lessons_with_text() if not codes or code in codes]
    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    results = await asyncio.gather(*(
        lesson_phonetics(client, code, [spoken(p["hebrew"]) for p in texts[code]["phrases"]]) for code in lessons))
    data = json.loads(READING_PHONETICS.read_text(encoding="utf-8")) if READING_PHONETICS.exists() else {}
    for code, result in zip(lessons, results):
        if result:
            data[code] = result
    READING_PHONETICS.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"écrit : {READING_PHONETICS}")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
