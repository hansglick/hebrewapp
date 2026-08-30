import json
import os
import tempfile
import time
from functools import lru_cache

from google import genai
from google.genai import types
from google.genai.types import FileState
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


def _wait_until_active(client, uploaded, timeout: float = 30.0):
    """Gemini traite un fichier uploadé de façon asynchrone (état PROCESSING
    avant ACTIVE) ; l'utiliser dans generate_content trop tôt lève une
    erreur 400 FAILED_PRECONDITION. On attend l'état ACTIVE (ou on échoue
    explicitement après le délai/l'échec)."""
    deadline = time.monotonic() + timeout
    while uploaded.state == FileState.PROCESSING:
        if time.monotonic() > deadline:
            raise RuntimeError(
                "Le traitement du fichier audio par Gemini a pris trop de temps, réessaie."
            )
        time.sleep(1)
        uploaded = client.files.get(name=uploaded.name)
    if uploaded.state != FileState.ACTIVE:
        raise RuntimeError("Gemini n'a pas pu traiter le fichier audio envoyé.")
    return uploaded


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


def evaluate_report(rapport: str, texte: str) -> dict:
    prompt = _load_prompt("extract_rapport").format(rapport=rapport, texte=texte)
    response_class = _load_response_class("extract_rapport")

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


def extract_lyrics(youtube_url: str, youtube_key: str) -> dict:
    """Demande à Gemini d'extraire et traduire les paroles d'une vidéo
    YouTube, et remet la réponse au format attendu par item_chanson.json."""
    prompt = _load_prompt("extract_lyrics")
    response_class = _load_response_class("extract_lyrics")

    response = _client().models.generate_content(
        model=GEMINI_MODEL,
        contents=[
            types.Part.from_uri(file_uri=youtube_url, mime_type="video/mp4"),
            prompt,
        ],
        config={
            "response_mime_type": "application/json",
            "response_schema": response_class,
            "temperature": 0.1,
        },
    )
    data = json.loads(response.text)

    title_he, title_fr = (list(data["title"]) + [""])[:2]
    lyrics = [
        {"index": idx + 1, "hebrew": he, "french": fr}
        for idx, (he, fr) in enumerate(data["lyrics"])
    ]
    return {
        "key": youtube_key,
        # Gemini est invité à "recopier" l'url dans sa réponse, mais il lui
        # arrive d'halluciner un autre identifiant de vidéo au passage — on
        # ignore donc systématiquement data["url"] et on garde l'url d'origine
        # fournie par le user, seule source fiable.
        "url": youtube_url,
        "title_he": title_he,
        "title_fr": title_fr,
        "lyrics": lyrics,
    }


def _generate_from_audio(prompt: str, response_class, audio_bytes: bytes, mime_type: str) -> dict:
    client = _client()
    base_mime_type = mime_type.split(";")[0].strip()
    suffix = _MIME_TO_SUFFIX.get(base_mime_type, ".wav")

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        uploaded = client.files.upload(
            file=tmp_path, config={"mime_type": base_mime_type}
        )
        uploaded = _wait_until_active(client, uploaded)
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


def evaluate_oral(question_hebrew: str, texte_hebrew: str, audio_bytes: bytes, mime_type: str) -> dict:
    prompt = _load_prompt("extract_oral_evaluation").format(
        question_hebrew=question_hebrew,
        texte_hebrew=texte_hebrew,
    )
    response_class = _load_response_class("extract_oral_evaluation")
    return _generate_from_audio(prompt, response_class, audio_bytes, mime_type)
