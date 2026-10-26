"""Évaluation d'une lecture à voix haute, en deux modèles (cf. config.EXTRACTOR / config.EVALUATOR) :

1. l'extracteur (Gemini Flash-Lite) écrit ce que l'élève a réellement prononcé, en phonétique, sans connaître le texte ;
2. l'évaluateur (Sol) compare ce verbatim au texte attendu et relève les erreurs de lecture.
Les erreurs sont ensuite regroupées par mot du texte (pas de note affichée pour l'instant).
"""

import asyncio
import io
import re
import wave
from typing import Literal

from google import genai
from google.genai import types
from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from app.config import GEMINI_API_KEY, OPENAI_API_KEY
from app.revision_agent.config import EVALUATOR, EXTRACTOR

# Convention commune à l'extraction et à l'évaluation, d'après les règles de translittération simplifiée
# de l'Académie de la langue hébraïque, notées selon la prononciation israélienne moderne (les sons, pas les lettres).
TRANSLITERATION = """Convention de translittération (Académie de la langue hébraïque, prononciation israélienne moderne) :
- b / v : בּ / ב, et ו consonne → v
- k / kh : כּ, ק → k ; כ sans dagesh, ח → kh
- p / f : פּ / פ
- sh / s : שׁ → sh ; שׂ, ס → s
- ts : צ
- g, d, t, z, l, m, n, y, h, r : ג, ד, ט/ת, ז, ל, מ, נ, י, ה, ר
- ' : coup de glotte de א ou ע quand il est prononcé
- voyelles : a, e, i, o, u
- tout en minuscules : l'accent tonique n'est pas noté
- ... : hésitation ou pause au milieu de la lecture
- mots séparés par des espaces, sans tiret entre les syllabes ; ו « et » attaché au mot suivant (uvat, veyesh)"""

EXTRACTION_PROMPT = f"""Voici l'enregistrement d'un élève débutant qui lit à voix haute un texte en hébreu.
Ne corrige rien : écris exactement ce qu'il a prononcé, son par son, erreurs comprises
(sons ou voyelles erronés, mots remplacés, sautés ou ajoutés, hésitations, répétitions), même si ce ne sont pas de vrais mots.

{TRANSLITERATION}"""

EVALUATION_PROMPT = f"""Tu es un professeur d'hébreu expert en phonétique de l'hébreu israélien moderne.
Un élève francophone débutant a lu à voix haute le texte attendu. On te donne la transcription phonétique de ce qu'il a réellement prononcé.
1. Compare mot à mot et relève toutes les erreurs de lecture : mot remplacé, sauté ou ajouté, hésitation, erreur de consonne ou de voyelle.
   L'accent tonique n'est pas évalué : ignore la place de l'accent et les majuscules.
   Une erreur par mot concerné. Le ח et le כ sans dagesh se prononcent kh : un simple h est une erreur de consonne.
   Ne signale pas les simples variantes d'écriture de la translittération.
   Les noms des locuteurs en début de réplique (ex. « דוד: ») font partie du texte à lire.
   Si la transcription est vide ou ne correspond pas du tout au texte, relève les mots sautés.
2. Les conseils sont en français et adressés à l'élève : n'y écris jamais d'hébreu en lettres latines ;
   pour citer un mot hébreu, écris-le en écriture hébraïque avec tous ses nikkoud ; décris les sons en français.
   La convention de translittération ne sert qu'aux champs expected et pronounced.

{TRANSLITERATION}"""

ErrorKind = Literal["mot_remplace", "mot_saute", "mot_ajoute", "hesitation", "consonne", "voyelle"]
SEVERITY: list[str] = ["mot_remplace", "mot_saute", "consonne", "voyelle", "mot_ajoute", "hesitation"]
NOT_A_LETTER = re.compile(r"[^א-ת]")  # nikkoud, ponctuation, espaces


class Phonetic(BaseModel):
    phonetic: str = Field(description="Ce que l'élève a prononcé, selon la convention de translittération")


class ReadingError(BaseModel):
    word: str = Field(description="Le mot concerné, en hébreu, exactement tel qu'il est écrit dans le texte (vide pour un mot ajouté)")
    word_niqqud: str = Field(description="Le même mot en hébreu avec tous ses nikkoud, vocalisé selon la prononciation correcte (vide pour un mot ajouté)")
    expected: str = Field(description="Sa prononciation correcte, selon la convention")
    pronounced: str = Field(description="Ce que l'élève a prononcé à la place, selon la convention (vide pour un mot sauté)")
    kind: ErrorKind
    advice: str = Field(description="Explication courte en français, adressée à l'élève (tutoiement), sans aucune translittération latine")


class Audit(BaseModel):
    errors: list[ReadingError]


class Remark(BaseModel):
    """Les erreurs relevées sur un même mot du texte, regroupées en une seule ligne."""
    word: str
    word_niqqud: str
    expected: str
    pronounced: list[str]  # mauvaises prononciations distinctes, dans l'ordre de la lecture
    kinds: list[ErrorKind]  # types d'erreur distincts, du plus grave au plus léger
    advice: str  # conseil de la première occurrence


class Evaluation(BaseModel):
    verbatim: str
    errors: list[Remark]
    extraction_seconds: float
    evaluation_seconds: float


def to_wav(pcm: bytes, rate: int) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


async def extract_verbatim(wav: bytes) -> str:
    client = genai.Client(api_key=GEMINI_API_KEY)
    response = await client.aio.models.generate_content(
        model=EXTRACTOR["model"],
        contents=[types.Part.from_bytes(data=wav, mime_type="audio/wav"), EXTRACTION_PROMPT],
        config=types.GenerateContentConfig(
            temperature=EXTRACTOR["temperature"],
            response_mime_type="application/json", response_schema=Phonetic,
            thinking_config=types.ThinkingConfig(thinking_level=EXTRACTOR["thinking"]),
        ),
    )
    return Phonetic.model_validate_json(response.text).phonetic.strip()


async def evaluate_verbatim(hebrew: list[str], verbatim: str) -> Audit:
    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    response = await client.responses.parse(
        model=EVALUATOR["model"],
        reasoning={"effort": EVALUATOR["effort"]},
        input=[
            {"role": "system", "content": EVALUATION_PROMPT},
            {"role": "user", "content": "Texte attendu :\n" + "\n".join(hebrew)
             + "\n\nPrononcé par l'élève :\n" + (verbatim or "(rien d'audible)")},
        ],
        text_format=Audit,
    )
    return response.output_parsed


def group_errors(errors: list[ReadingError]) -> list[Remark]:
    """Une ligne par mot du texte (par prononciation pour un mot ajouté), dans l'ordre de première apparition."""
    groups: dict[str, Remark] = {}
    for e in errors:
        pronounced = " ".join(e.pronounced.split())
        key = NOT_A_LETTER.sub("", e.word) or "+" + pronounced.lower()
        remark = groups.get(key)
        if remark is None:
            groups[key] = Remark(word=e.word, word_niqqud=e.word_niqqud, expected=e.expected,
                                 pronounced=[pronounced] if pronounced else [], kinds=[e.kind], advice=e.advice)
            continue
        if pronounced and pronounced.lower() not in (p.lower() for p in remark.pronounced):
            remark.pronounced.append(pronounced)
        if e.kind not in remark.kinds:
            remark.kinds.append(e.kind)
    for remark in groups.values():
        remark.kinds.sort(key=SEVERITY.index)
    return list(groups.values())


async def evaluate_reading(hebrew: list[str], pcm: bytes, rate_hz: int) -> Evaluation:
    loop = asyncio.get_running_loop()
    started = loop.time()
    verbatim = await extract_verbatim(to_wav(pcm, rate_hz))
    extracted = loop.time()
    audit = await evaluate_verbatim(hebrew, verbatim)
    return Evaluation(verbatim=verbatim, errors=group_errors(audit.errors),
                      extraction_seconds=extracted - started, evaluation_seconds=loop.time() - extracted)
