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

# L'au revoir du prof, le même pour toutes les tâches (cf. demande explicite du user) : un texte fixe par mode de
# langue, enregistré avec les accueils (sous cette clé d'intros.json), joué à la fin de la séance à la place de sa
# dernière prise de parole (cf. TextTeacher.end). Une seule phrase : un seul segment (cf. session.translate_segment).
FAREWELL = "au_revoir"
FAREWELL_HEBREW = "טוֹב, אָז נִרְאֶה לִי שֶׁעָבַרְנוּ עַל הַכֹּל לְהַיּוֹם, תִּשְׁמֹר עַל עַצְמְךָ וְנִתְרָאֶה בְּקָרוֹב!"
FAREWELL_FRENCH = "Bon, eh bien, je crois qu'on a fait le tour pour aujourd'hui, porte-toi bien et à très vite !"
FAREWELL_TEXTS = {
    "he": {"text": FAREWELL_HEBREW, "french": FAREWELL_FRENCH, "hebrew": FAREWELL_HEBREW, "spoken": "he"},
    "fr": {"text": FAREWELL_FRENCH, "french": FAREWELL_FRENCH, "hebrew": FAREWELL_HEBREW, "spoken": "fr"},
}


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


def farewells(tts_model: str | None, voice: str) -> dict:
    """L'au revoir de chaque mode de langue ({mode: {"text", "french", "hebrew", "spoken", "pcm"}}, cf. intro) : sa voix
    enregistrée si elle l'a été avec ce modèle et cette voix, sinon dite à la volée."""
    recorded = intros().get(FAREWELL, {})
    same_voice = tts_model == INTRO_TTS_MODEL and voice == INTRO_VOICE
    return {mode: {**entry, "pcm": recording(recorded[mode]["audio"])
                   if same_voice and mode in recorded and recorded[mode]["text"] == entry["text"] else None}
            for mode, entry in FAREWELL_TEXTS.items()}
