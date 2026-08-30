"""Jeu de rôle (JDR) — conversation en direct avec un partenaire IA (Gemini
Live), un item par leçon dans item_jdr.json (clé = code de leçon
"chapter.lesson", contexte/objectif/system_instruction déjà rédigés hors
ligne). Prototypé dans instructions/testlive/webapp_whisper avant intégration
ici.

Le verbatim de l'étudiant est transcrit par Whisper (app.openai_client)
plutôt que par la transcription native de l'API Live, qui a tendance à
"corriger" silencieusement ses erreurs vers une phrase grammaticalement
correcte — inadapté à un usage pédagogique où on veut repérer les vraies
erreurs (cf. app.routers.jdr, qui fait ce choix à l'usage)."""

from functools import lru_cache

from google import genai
from google.genai import types

from app.config import GEMINI_API_KEY
from app.data_loader import get_dataset

LIVE_MODEL = "models/gemini-3.1-flash-live-preview"


@lru_cache(maxsize=1)
def live_client() -> genai.Client:
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY n'est pas configurée (voir backend/.env.example)")
    return genai.Client(http_options={"api_version": "v1beta"}, api_key=GEMINI_API_KEY)


def get_jdr_item(lesson_code: str) -> dict | None:
    return get_dataset("jdr").get(lesson_code)


def get_jdr_items_for_chapter(chap_id: str) -> dict:
    """{lesson_code: item} pour toutes les leçons de `chap_id` — sert à
    afficher rôle/mission sur chaque tuile de la liste "conversations
    précédentes" d'un chapitre sans un aller-retour par leçon."""
    return {code: item for code, item in get_dataset("jdr").items() if code.split(".")[0] == chap_id}


def jdr_image_url(lesson_code: str) -> str:
    # Le champ "imagepath" du dataset pointe vers un dossier erroné
    # (results/jeuderole/images/) — seul le nom de fichier est fiable ; les
    # vrais fichiers vivent dans backend/results/images_jdr/.
    return f"images_jdr/jdrimage_{lesson_code}.jpg"


def build_live_config(item: dict) -> types.LiveConnectConfig:
    return types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        media_resolution="MEDIA_RESOLUTION_MEDIUM",
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Zephyr"))
        ),
        # language_codes en BCP-47 langue+SCRIPT+région ("he-Hebr-IL", pas
        # juste "he-IL") : sans le sous-tag de script, le modèle peut
        # romaniser certains passages au lieu d'écrire en alphabet hébreu.
        output_audio_transcription=types.AudioTranscriptionConfig(language_codes=["he-Hebr-IL"]),
        system_instruction=types.Content(
            parts=[types.Part.from_text(text=item["instruction"])],
            role="user",
        ),
    )
