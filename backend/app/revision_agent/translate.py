"""Traduction de chaque prise de parole du prof, affichée sous l'original : en français s'il a parlé hébreu, en hébreu
s'il a parlé français (évaluation orale)."""

import json

from google import genai
from google.genai import types

from app.config import GEMINI_API_KEY
from app.revision_agent.config import FRENCH_SPEECH_MODEL, TRANSLATION_MODEL

# Un mot hébreu cité reste en écriture hébraïque dans la traduction (cf. demande explicite du user).
TRANSLATION_PROMPT = """Traduis en français ce qu'un professeur d'hébreu dit à son élève débutant.
Traduction fidèle et naturelle, en tutoyant l'élève. Garde les pauses « ... » ou « — ».
Un mot, une forme, une lettre ou une phrase hébreux que le professeur cite comme exemple (le mot qu'il corrige, celui
qu'il fait prononcer, la phrase qu'il lit, entre guillemets ou non) restent en écriture hébraïque, tels qu'il les a
dits, jamais en lettres latines : « תַּגִּיד לוֹמֵד, לֹא לָמַד » → « Dis לוֹמֵד, pas לָמַד ». Seul le reste se traduit.
Réponds uniquement par la traduction, sans guillemets ni commentaire."""

# La transcription automatique de la voix du prof écrit en lettres latines les mots hébreux qu'il prononce en parlant
# français : ils sont réécrits en hébreu (cf. demande explicite du user), dans le même appel que la traduction.
FRENCH_SPEECH_PROMPT = """Voici la transcription automatique de ce qu'un professeur d'hébreu vient de dire en français
à son élève débutant. Les mots et les phrases hébreux qu'il a prononcés y sont souvent transcrits en lettres latines
(« on dirait plutôt lehaifa », « le verbe gar », « shlomo gar be tel aviv »).
- francais : recopie le texte à l'identique, en réécrivant seulement chaque mot ou groupe de mots hébreux en écriture
  hébraïque, sans nikkoud (« on dirait plutôt לחיפה », « le verbe גר », « שלמה גר בתל אביב »). Les noms de
  personnes ou de lieux pris dans une phrase française restent en lettres latines (« Shlomo étudie à Haïfa » reste
  tel quel) ; ils ne passent en hébreu qu'au sein d'une citation hébraïque (« שלמה גר בחיפה »). Ne
  change rien d'autre : ni les mots français, ni la ponctuation, ni les pauses.
- hebreu : la traduction de tout le texte en hébreu moderne courant, de la vie de tous les jours, sans nikkoud, en
  tutoyant l'élève (au masculin), en gardant tels quels les mots hébreux cités et les pauses « ... » ou « — »."""

FRENCH_SPEECH_SCHEMA = {
    "type": "OBJECT",
    "properties": {"francais": {"type": "STRING"}, "hebreu": {"type": "STRING"}},
    "required": ["francais", "hebreu"],
}

_client: genai.Client | None = None


async def translate_to_french(hebrew: str) -> str:
    return await translate(hebrew, TRANSLATION_PROMPT)


async def french_speech(french: str) -> tuple[str, str]:
    """Ce que le prof a dit en français : le texte, ses mots hébreux réécrits en hébreu, et sa traduction en hébreu."""
    result = json.loads(await translate(french, FRENCH_SPEECH_PROMPT, FRENCH_SPEECH_SCHEMA, FRENCH_SPEECH_MODEL))
    return str(result.get("francais") or french).strip(), str(result.get("hebreu") or "").strip()


async def translate(text: str, prompt: str, schema: dict | None = None, model: str = TRANSLATION_MODEL) -> str:
    global _client
    _client = _client or genai.Client(api_key=GEMINI_API_KEY)  # un seul client : la connexion reste ouverte entre deux traductions
    json_output = {"response_mime_type": "application/json", "response_schema": schema} if schema else {}
    response = await _client.aio.models.generate_content(
        model=model,
        contents=text,
        # Réflexion minimale : une traduction courte n'en a pas besoin, et elle doit suivre la voix du prof.
        config=types.GenerateContentConfig(
            system_instruction=prompt, temperature=0,
            thinking_config=types.ThinkingConfig(thinking_level="minimal"), **json_output,
        ),
    )
    return (response.text or "").strip()
