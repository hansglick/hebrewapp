"""Mode texte : la voix du prof (cf. demande explicite du user). Chaque prise de parole écrite est synthétisée par un
modèle TTS (cf. config.TTS_MODELS), en streaming : PCM16 mono 24 kHz, joué par le navigateur dès le premier morceau."""

import base64
import logging
from collections import Counter
from typing import AsyncIterator

from google import genai

from app.config import GEMINI_API_KEY
from app.revision_agent.translate import FLASH_USAGE

log = logging.getLogger("revision_agent.tts")

# Le ton et l'accent du prof (cf. prompts.PROFILE_AND_LANGUAGE), en anglais : écrit en français, il risquait de pousser
# la voix vers un accent français, y compris en hébreu (cf. demande explicite du user) ; gemini-3.1-flash-tts-preview le
# refuse (« Speech metadata is not supported for this model », vérifié) et parle sans.
STYLE = ("Warm, light and friendly, like a friend helping a beginner. Hebrew is spoken with a native Israeli accent "
         "(Tel Aviv), slowly and clearly articulated; French is spoken naturally, like a native French speaker.")
STYLED_MODELS = {"gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"}

_client: genai.Client | None = None


async def speak(text: str, model: str, voice: str) -> AsyncIterator[bytes]:
    global _client
    _client = _client or genai.Client(api_key=GEMINI_API_KEY)
    content = {"type": "text", "text": text}
    if model in STYLED_MODELS:
        content["annotations"] = [{"type": "speech_metadata", "style": STYLE}]
    stream = await _client.aio.interactions.create(
        model=model, input=[{"type": "user_input", "content": [content]}], response_format={"type": "audio"},
        generation_config={"speech_config": [{"voice": voice}]}, stream=True)
    async for event in stream:
        if event.event_type == "step.delta" and event.delta.type == "audio":
            yield base64.b64decode(event.delta.data)
        elif (usage := getattr(getattr(event, "interaction", None), "usage", None)) is not None:
            count_usage(model, usage)


def count_usage(model: str, usage) -> None:
    if (counts := FLASH_USAGE.get()) is None:
        return
    model_counts = counts.setdefault(model, Counter())
    model_counts["input"] += sum(m.tokens or 0 for m in usage.input_tokens_by_modality or [])
    model_counts["output"] += sum(m.tokens or 0 for m in usage.output_tokens_by_modality or [])
