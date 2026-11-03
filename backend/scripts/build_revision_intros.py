"""Enregistre l'accueil du prof de chaque tâche, dans les deux modes de langue (page « mode texte », cf. demande
explicite du user) : au lancement d'une séance, il est joué tout de suite, sans attendre le prof ni sa voix (cf.
intros.py).

Pour chaque tâche et chaque mode : le prof texte écrit son accueil avec les vraies instructions de la tâche, comme en
séance, mais avec le modèle le plus fort (WELCOME_MODEL : il est enregistré une fois pour toutes ; Flash-Lite y faisait
des fautes d'hébreu, vérifié), et sans rien citer de propre à une séance (nombre d'exercices, leçon, contenu) ; sa traduction est faite comme en séance (translate.py) ; sa voix est enregistrée avec INTRO_TTS_MODEL et la
voix fixe de la page. On vérifie qu'il n'appelle aucune fonction et que sa réplique finit par une ponctuation (elle
forme alors un seul segment, cf. session.translate_segment).

Écrit dans data/revision_intros/ : intros.json ({tâche: {mode: {"text", "french", "hebrew", "spoken", "audio"}}}) et
un fichier WAV par accueil (PCM16 mono 24 kHz).

Usage (depuis backend/) : .venv/Scripts/python.exe -m scripts.build_revision_intros [tâche…]
Seulement les tâches données (toutes par défaut) : les autres sont gardées.
"""

import asyncio
import json
import sys
import wave

from google.genai import types

from app.revision_agent import prompts
from app.revision_agent.completion import CompletionSession, qualified_concepts
from app.revision_agent.completion import draw_items as completion_items
from app.revision_agent.comprehension import ComprehensionSession
from app.revision_agent.config import DEFAULT_LANGUAGES, SAMPLE_RATE
from app.revision_agent.declension import DeclensionSession
from app.revision_agent.declension import draw_items as declension_items
from app.revision_agent.expression import ExpressionSession
from app.revision_agent.intros import INTRO_TTS_MODEL, INTRO_VOICE, INTROS_DIR, INTROS_FILE
from app.revision_agent.question import QuestionSession
from app.revision_agent.question import draw_items as question_items
from app.revision_agent.reading import ReadingSession
from app.revision_agent.session import HEBREW_LETTER, LATIN_LETTER
from app.revision_agent.text_teacher import TextTeacher
from app.revision_agent.translate import french_speech, translate_to_french
from app.revision_agent.tts import speak

WELCOME_MODEL = "gemini-3.8-flash"
LESSON = "0.11"  # une leçon qui a un texte et des exercices pour toutes les tâches ; l'accueil n'en cite rien
GENERIC = ("(Message de l'application) Cet accueil est enregistré une fois pour toutes les séances : n'y cite ni "
           "nombre d'exercices ou de questions, ni leçon, ni contenu particulier.")


def session(task: str):
    if task == "lecture":
        return ReadingSession(None, INTRO_VOICE, [LESSON])
    if task == "comprehension":
        return ComprehensionSession(None, INTRO_VOICE, LESSON)
    if task == "expression":
        return ExpressionSession(None, INTRO_VOICE, LESSON)
    if task == "declinaison":
        return DeclensionSession(None, INTRO_VOICE, LESSON, declension_items(LESSON, True, True))
    if task == "completion":
        return CompletionSession(None, INTRO_VOICE, LESSON, completion_items(LESSON, True, True),
                                 qualified_concepts(LESSON, True, True))
    if task == "question":
        return QuestionSession(None, INTRO_VOICE, LESSON, question_items(LESSON, True, True))
    raise ValueError(task)


async def welcome(task: str, language: str) -> str:
    teacher = TextTeacher.replacing(session(task).live, WELCOME_MODEL)
    await teacher.connect()
    # Le message de départ de la tâche, dans ce mode de langue.
    start = teacher.start_message.replace(prompts.language_mode(DEFAULT_LANGUAGES[task]),
                                          prompts.language_mode(language))
    response = await teacher.client.aio.models.generate_content(
        model=WELCOME_MODEL, contents=[types.Content(role="user", parts=[types.Part(text=f"{start}\n{GENERIC}")])],
        config=teacher.config)
    parts = response.candidates[0].content.parts
    assert not any(p.function_call for p in parts), f"{task}/{language} : appel de fonction dans l'accueil"
    text = " ".join(p.text.strip() for p in parts if p.text and not p.thought).strip()
    assert text and text[-1] in ".!?…", f"{task}/{language} : accueil vide ou sans ponctuation finale : {text}"
    return text


async def record(text: str, path) -> None:
    pcm = b"".join([chunk async for chunk in speak(text, INTRO_TTS_MODEL, INTRO_VOICE)])
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(pcm)


async def main(tasks: list[str]) -> None:
    INTROS_DIR.mkdir(parents=True, exist_ok=True)
    intros = json.loads(INTROS_FILE.read_text(encoding="utf-8")) if INTROS_FILE.exists() else {}
    for task in tasks:
        for language in ("he", "fr"):
            text = await welcome(task, language)
            # Comme en séance (cf. session.translate_segment) : en français, ses mots hébreux réécrits en hébreu et sa
            # traduction en hébreu ; en hébreu, sa traduction en français.
            if len(LATIN_LETTER.findall(text)) >= len(HEBREW_LETTER.findall(text)):
                french, hebrew = await french_speech(text)
                spoken = "fr"
            else:
                french, hebrew, spoken = await translate_to_french(text), text, "he"
            audio = f"{task}-{language}.wav"
            await record(text, INTROS_DIR / audio)
            intros.setdefault(task, {})[language] = {"text": text, "french": french, "hebrew": hebrew,
                                                     "spoken": spoken, "audio": audio}
            print(f"{task} / {language} ({spoken}) : {text}\n  → {french}")
    INTROS_FILE.write_text(json.dumps(intros, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:] or list(DEFAULT_LANGUAGES)))
