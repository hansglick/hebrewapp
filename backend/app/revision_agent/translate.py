"""Traduction en français de chaque prise de parole du prof, affichée sous l'hébreu."""

from google import genai
from google.genai import types

from app.config import GEMINI_API_KEY
from app.revision_agent.config import TRANSLATION_MODEL

TRANSLATION_PROMPT = """Traduis en français ce qu'un professeur d'hébreu dit à son élève débutant.
Traduction fidèle et naturelle, en tutoyant l'élève. Garde les pauses « ... » ou « — ».
Réponds uniquement par la traduction, sans guillemets ni commentaire."""

_client: genai.Client | None = None


async def translate_to_french(hebrew: str) -> str:
    global _client
    _client = _client or genai.Client(api_key=GEMINI_API_KEY)  # un seul client : la connexion reste ouverte entre deux traductions
    response = await _client.aio.models.generate_content(
        model=TRANSLATION_MODEL,
        contents=hebrew,
        # Réflexion minimale : une traduction courte n'en a pas besoin, et elle doit suivre la voix du prof.
        config=types.GenerateContentConfig(
            system_instruction=TRANSLATION_PROMPT, temperature=0,
            thinking_config=types.ThinkingConfig(thinking_level="minimal"),
        ),
    )
    return (response.text or "").strip()
