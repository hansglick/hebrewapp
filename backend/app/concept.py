"""Révise le concept grammatical de la leçon — conversation en direct
(Gemini Live) avec une persona "professeur de concept" qui présente le
concept puis fait avancer l'étudiant pas à pas, une question à la fois
(item_concept_revision.json, généré hors ligne par
app.vocabulary.concept_system_instruction). Même pipeline audio que
app.jdr/app.revision (client Gemini Live partagé, cf.
app.routers.concept)."""

from google.genai import types

from app.data_loader import get_dataset
from app.jdr import LIVE_MODEL, live_client  # noqa: F401 — réexporté pour le router

# Comme app.revision : sans un premier tour, la persona reste silencieuse en
# attendant que l'étudiant parle en premier — or le template lui demande de
# saluer et se présenter en premier.
AMORCE = "Bonjour, je suis prêt à réviser le concept de cette leçon."


def get_concept_instruction(lesson_code: str) -> str | None:
    return get_dataset("concept_revision").get(lesson_code)


def get_concept_item(lesson_code: str) -> dict | None:
    return get_dataset("concept").get(lesson_code)


def concept_image_url(lesson_code: str) -> str:
    # Comme jdr_image_url (app.jdr) : le champ "imagepath" annoncé pour ce
    # dataset n'existe en fait pas dans item_concept.json (vérifié) — les
    # vrais fichiers vivent dans backend/results/images_concept/, nommés
    # de façon prévisible ("image_{code}.jpg", vérifié sur les 159
    # fichiers présents), donc construit directement plutôt que lu depuis
    # le dataset.
    return f"images_concept/image_{lesson_code}.jpg"


def build_live_config(instruction: str) -> types.LiveConnectConfig:
    return types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        media_resolution="MEDIA_RESOLUTION_MEDIUM",
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Zephyr"))
        ),
        output_audio_transcription=types.AudioTranscriptionConfig(language_codes=["he-Hebr-IL"]),
        system_instruction=types.Content(
            parts=[types.Part.from_text(text=instruction)],
            role="user",
        ),
    )
