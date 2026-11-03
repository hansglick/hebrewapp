"""Page « mode texte » : l'accueil du prof de chaque tâche, enregistré une fois pour toutes (cf. demande explicite du
user, scripts/build_revision_intros.py), dans les deux modes de langue : texte, traduction et voix. Au lancement d'une
séance, il est joué tout de suite (cf. TextTeacher.events), sans attendre le prof ni la synthèse de sa voix, et sans
les payer ; avec un autre modèle de voix que celui de l'enregistrement, seul son texte sert, dit à la volée.
"""

import json
import wave
from functools import cache

from app.config import DATA_DIR

INTROS_DIR = DATA_DIR / "revision_intros"
INTROS_FILE = INTROS_DIR / "intros.json"  # {tâche: {mode: {"text", "french", "hebrew", "spoken", "audio"}}}
INTRO_TTS_MODEL = "gemini-3.8-flash-lite-tts"  # la voix par défaut de la page (cf. config.TTS_MODELS)
INTRO_VOICE = "Enceladus"  # la voix fixe de la page (cf. RevisionAgentScreen.VOICE)


@cache
def intros() -> dict:
    try:
        return json.loads(INTROS_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}


@cache
def recording(name: str) -> bytes:
    with wave.open(str(INTROS_DIR / name), "rb") as wav:
        return wav.readframes(wav.getnframes())


def intro(task: str, language: str, tts_model: str | None, voice: str) -> dict | None:
    """L'accueil enregistré de la tâche dans ce mode de langue ({"text", "french", "hebrew", "spoken", "pcm"}, pcm :
    sa voix, None si elle n'a pas été enregistrée avec ce modèle et cette voix) ; None s'il n'y en a pas."""
    entry = intros().get(task, {}).get(language)
    if not entry:
        return None
    same_voice = tts_model == INTRO_TTS_MODEL and voice == INTRO_VOICE
    return {**entry, "pcm": recording(entry["audio"]) if same_voice else None}
