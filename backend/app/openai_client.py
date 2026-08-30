import os
import tempfile
from functools import lru_cache

from openai import OpenAI

from app.config import OPENAI_API_KEY, OPENAI_TRANSCRIBE_MODEL

_MIME_TO_SUFFIX = {
    "audio/mp3": ".mp3",
    "audio/mpeg": ".mp3",
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
}


@lru_cache(maxsize=1)
def _client():
    if not OPENAI_API_KEY:
        raise RuntimeError(
            "OPENAI_API_KEY n'est pas configurée (voir backend/.env.example)"
        )
    return OpenAI(api_key=OPENAI_API_KEY)


# Renforce le hint `language` : sur un audio court/ambigu le modèle peut
# sinon détecter une autre langue malgré ce paramètre — un prompt
# d'amorçage dans la langue attendue le biaise fortement vers elle
# (technique documentée par OpenAI pour les modèles de transcription).
_DEFAULT_PROMPTS = {
    "he": "זהו תמלול בעברית של תלמיד הלומד עברית.",
    "fr": "Ceci est la transcription en français du compte-rendu oral d'un étudiant à propos d'un texte hébraïque.",
}

# Amorçage dédié à la recherche dans le dictionnaire (mode fr->he) : un mot ou
# une courte expression isolée, pas la narration continue du "rapport" visée
# par _DEFAULT_PROMPTS["fr"] — un amorçage orienté "compte-rendu" biaiserait
# sinon la transcription vers une syntaxe de phrase complète.
DICTIONNAIRE_PROMPT_FR = (
    "Ceci est la transcription d'un mot isolé ou d'une courte expression en français, "
    "prononcé par un étudiant qui cherche sa traduction dans un dictionnaire."
)


def extract_verbatim(audio_bytes: bytes, mime_type: str, language: str = "he", prompt: str | None = None) -> dict:
    base_mime_type = mime_type.split(";")[0].strip()
    suffix = _MIME_TO_SUFFIX.get(base_mime_type, ".wav")

    if prompt is None:
        prompt = _DEFAULT_PROMPTS.get(language, _DEFAULT_PROMPTS["he"])

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        with open(tmp_path, "rb") as audio_file:
            transcript = _client().audio.transcriptions.create(
                model=OPENAI_TRANSCRIBE_MODEL,
                file=audio_file,
                language=language,
                prompt=prompt,
            )
    finally:
        os.remove(tmp_path)

    return {"verbatim": transcript.text}
