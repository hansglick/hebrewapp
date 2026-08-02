import json
import os
import tempfile
from functools import lru_cache

from google import genai
from pydantic import Field, create_model

from app.config import GEMINI_API_KEY, GEMINI_MODEL, PROMPTS_DIR

_TYPES_DE_BASE = {"bool": bool, "str": str, "int": int, "float": float, "list": list, "dict": dict}

_MIME_TO_SUFFIX = {
    "audio/mp3": ".mp3",
    "audio/mpeg": ".mp3",
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
}


def _load_prompt(name: str) -> str:
    with open(PROMPTS_DIR / f"{name}.txt", "r", encoding="utf-8") as f:
        return f.read()


def _load_response_class(name: str):
    with open(PROMPTS_DIR / f"{name}.json", "r", encoding="utf-8") as f:
        config = json.load(f)

    fields = {}
    for field_name, info in config["champs"].items():
        # Restreint à un jeu de types fixe, aucune exécution arbitraire possible.
        field_type = eval(info["type"], {"__builtins__": None}, _TYPES_DE_BASE)
        fields[field_name] = (field_type, Field(..., description=info["description"]))

    return create_model(config["nom_modele"], **fields)


@lru_cache(maxsize=1)
def _client():
    if not GEMINI_API_KEY:
        raise RuntimeError(
            "GEMINI_API_KEY n'est pas configurée (voir backend/.env.example)"
        )
    return genai.Client(api_key=GEMINI_API_KEY)


def evaluate_translation(sentence_to_translate: str, student_solution: str) -> dict:
    prompt = _load_prompt("extract_translation_evaluation").format(
        sentence_to_translate=sentence_to_translate,
        student_solution=student_solution,
    )
    response_class = _load_response_class("extract_translation_evaluation")

    response = _client().models.generate_content(
        model=GEMINI_MODEL,
        contents=[prompt],
        config={
            "response_mime_type": "application/json",
            "response_schema": response_class,
            "temperature": 0.1,
        },
    )
    return json.loads(response.text)


def evaluate_oral(question_hebrew: str, texte_hebrew: str, audio_bytes: bytes, mime_type: str) -> dict:
    prompt = _load_prompt("extract_oral_evaluation").format(
        question_hebrew=question_hebrew,
        texte_hebrew=texte_hebrew,
    )
    response_class = _load_response_class("extract_oral_evaluation")

    client = _client()
    suffix = _MIME_TO_SUFFIX.get(mime_type, ".webm")

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        uploaded = client.files.upload(file=tmp_path)
        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=[uploaded, prompt],
                config={
                    "response_mime_type": "application/json",
                    "response_schema": response_class,
                    "temperature": 0.1,
                },
            )
        finally:
            client.files.delete(name=uploaded.name)
    finally:
        os.remove(tmp_path)

    return json.loads(response.text)
