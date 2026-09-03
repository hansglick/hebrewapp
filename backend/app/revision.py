"""Révise avec ton professeur — conversation en direct (Gemini Live) avec
une persona "professeur de révision" qui interroge l'étudiant sur le
vocabulaire de sa leçon (item_revision.json, généré hors ligne par
app.vocabulary.revision_system_instruction). Même pipeline audio que
app.jdr (client Gemini Live partagé, cf. app.routers.revision)."""

from google.genai import types

from app.data_loader import get_dataset
from app.jdr import LIVE_MODEL, live_client  # noqa: F401 — réexporté pour le router

# Contrairement à item_jdr.json, item_revision.json ne porte pas de champ
# "amorce" dédié (juste l'instruction) — sans un premier tour, la persona
# reste silencieuse en attendant que l'étudiant parle en premier.
AMORCE = "Bonjour, je suis prêt à réviser."


def get_revision_instruction(lesson_code: str) -> str | None:
    return get_dataset("revision").get(lesson_code)


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
