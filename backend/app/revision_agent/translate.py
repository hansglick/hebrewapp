"""Traduction de chaque prise de parole du prof, affichée sous l'original : en français s'il a parlé hébreu, en hébreu
s'il a parlé français (évaluation orale)."""

import json
import logging
import re
from collections import Counter
from contextvars import ContextVar

from google import genai
from google.genai import types

from app.config import GEMINI_API_KEY
from app.revision_agent.config import FLASH_PRICES, FRENCH_SPEECH_MODEL, TRANSLATION_MODEL

log = logging.getLogger("revision_agent.translate")

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
  tutoyant l'élève (au masculin), en gardant tels quels les mots hébreux cités et les pauses « ... » ou « — ».
  Uniquement en lettres hébraïques : aucune lettre latine, ni translittération (« ma nishma » → « מה נשמע »), ni nom
  propre (« Shlomo » → « שלמה », « Haïfa » → « חיפה »), ni abréviation (« (f.) » → « (נ') »)."""

# La traduction hébraïque ne contient jamais de lettre latine (cf. demande explicite du user) : redemandée une fois en
# signalant la faute, puis, en dernier recours, privée de ses mots latins.
LATIN_WORD = re.compile(r"[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'.-]*")
LATIN_RETRIES = 1

FRENCH_SPEECH_SCHEMA = {
    "type": "OBJECT",
    "properties": {"francais": {"type": "STRING"}, "hebreu": {"type": "STRING"}},
    "required": ["francais", "hebreu"],
}

_client: genai.Client | None = None
# Tokens des appels de la séance en cours, par poste et modèle (Counter « input », « output ») : la séance pose le sien
# au démarrage (cf. session.TeacherSession.run), ses tâches en héritent.
FLASH_USAGE: ContextVar[dict[tuple[str, str], Counter] | None] = ContextVar("flash_usage", default=None)

# Les postes de la facture, dans l'ordre où elle les liste : les étapes des schémas (cf. demande explicite du user).
BILL_ITEMS = ("Transcription en direct", "Transcription hébraïque", "Lettres hébraïques", "Relecture de l'orthographe",
              "Transcription phonétique", "Juge des mots", "Juge de prononciation", "Juge de la phrase",
              "Juge de la contrainte", "Juge de la plausibilité", "Juge de la grammaire",
              "Préparation de la déclinaison", "Juge de la déclinaison", "Commentaires en français",
              "Traduction du prof", "Le prof parle français", "Voix du prof")


def usage_of(item: str, model: str) -> Counter | None:
    """Les tokens de la séance pour ce poste et ce modèle, None hors séance."""
    usage = FLASH_USAGE.get()
    return None if usage is None else usage.setdefault((item, model), Counter())


def count_response(item: str, model: str, response, thoughts: bool = True) -> None:
    """Ajoute à la facture les tokens d'une réponse generate_content (thoughts : la réflexion comptée en sortie)."""
    if (counts := usage_of(item, model)) is not None and (meta := response.usage_metadata):
        counts["input"] += meta.prompt_token_count or 0
        counts["output"] += (meta.candidates_token_count or 0) + ((meta.thoughts_token_count or 0) if thoughts else 0)


def flash_bill(usage: dict[tuple[str, str], Counter]) -> list[dict]:
    """Tokens et prix en dollars de chaque poste, avec son modèle (cf. config.FLASH_PRICES), dans l'ordre de
    BILL_ITEMS."""
    rank = {item: i for i, item in enumerate(BILL_ITEMS)}
    return [{"item": item, "model": model, "input_tokens": counts["input"], "output_tokens": counts["output"],
             "input_cost": counts["input"] * FLASH_PRICES[model][0] / 1e6,
             "output_cost": counts["output"] * FLASH_PRICES[model][1] / 1e6}
            for (item, model), counts in sorted(usage.items(), key=lambda entry: rank.get(entry[0][0], len(rank)))]


async def translate_to_french(hebrew: str) -> str:
    return await translate(hebrew, TRANSLATION_PROMPT, item="Traduction du prof")


async def french_speech(french: str, model: str = FRENCH_SPEECH_MODEL) -> tuple[str, str]:
    """Ce que le prof a dit en français : le texte, ses mots hébreux réécrits en hébreu, et sa traduction en hébreu (par
    model, celui de la tâche, cf. TeacherSession.french_speech_model)."""
    request = french
    for attempt in range(LATIN_RETRIES + 1):
        result = json.loads(await translate(request, FRENCH_SPEECH_PROMPT, FRENCH_SPEECH_SCHEMA, model,
                                            "Le prof parle français"))
        hebrew = str(result.get("hebreu") or "").strip()
        if not LATIN_WORD.search(hebrew):
            break
        log.warning("lettres latines dans la traduction hébraïque (essai %d) : %s", attempt + 1, hebrew)
        request = (f"{french}\n\n(Ta traduction hébraïque précédente contenait des lettres latines : « {hebrew} ». "
                   "Écris-la uniquement en lettres hébraïques.)")
    else:
        hebrew = re.sub(r"\(\s*\)|\s{2,}", " ", LATIN_WORD.sub("", hebrew)).strip()
    return str(result.get("francais") or french).strip(), hebrew


async def translate(text: str, prompt: str, schema: dict | None = None, model: str = TRANSLATION_MODEL,
                    item: str = "Traduction du prof") -> str:
    """Un appel au modèle, compté dans la facture au poste item (cf. BILL_ITEMS)."""
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
    count_response(item, model, response)
    return (response.text or "").strip()
