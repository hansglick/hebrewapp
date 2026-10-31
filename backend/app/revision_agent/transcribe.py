"""Mode texte : la réponse enregistrée de l'élève, transcrite par un modèle de transcription (cf. demande explicite du
user) avant d'aller au prof comme une réponse écrite."""

import logging
import re
from collections import Counter

from google import genai
from google.genai import types

from app.config import GEMINI_API_KEY
from app.revision_agent.config import TRANSCRIBE_MODEL
from app.revision_agent.translate import FLASH_USAGE

log = logging.getLogger("revision_agent.transcribe")

_client: genai.Client | None = None
# L'hébreu imposé : en détection automatique, la voix d'un débutant est transcrite en français, voire dans une langue
# au hasard (vérifié) ; une phrase dite en français reste transcrite en français.
CONFIG = types.GenerateContentConfig(audio_transcription_config=types.AudioTranscriptionConfig(language_codes=["he-IL"]))

# Un mot hébreu qui se prononce comme son cousin arabe est parfois écrit en arabe (« يوم » pour « יום », vérifié), et
# le prof ne répond alors plus rien : chaque lettre arabe est remplacée par la lettre hébraïque correspondante, en
# forme finale en fin de mot.
ARABIC_TO_HEBREW = str.maketrans({
    "ا": "א", "أ": "א", "إ": "א", "آ": "א", "ء": "א", "ب": "ב", "ت": "ת", "ث": "ת", "ج": "ג", "ح": "ח", "خ": "כ",
    "د": "ד", "ذ": "ז", "ر": "ר", "ز": "ז", "س": "ס", "ش": "ש", "ص": "צ", "ض": "צ", "ط": "ט", "ظ": "ט", "ع": "ע",
    "غ": "ג", "ف": "פ", "ق": "ק", "ك": "כ", "ل": "ל", "م": "מ", "ن": "נ", "ه": "ה", "ة": "ה", "و": "ו", "ؤ": "ו",
    "ي": "י", "ى": "י", "ئ": "י",
})
ARABIC = re.compile("[\\u0600-\\u06FF]")  # alphabet arabe
FINAL_FORMS = {"כ": "ך", "מ": "ם", "נ": "ן", "פ": "ף", "צ": "ץ"}


def hebraized(text: str) -> str:
    if not ARABIC.search(text):
        return text
    words = [word.translate(ARABIC_TO_HEBREW) if ARABIC.search(word) else word for word in text.split(" ")]
    words = [re.sub(r"[כמנפצ](?=[^א-ת]*$)", lambda m: FINAL_FORMS[m.group()], word) if word else word
             for word in words]
    result = re.sub(ARABIC, "", " ".join(words))
    log.info("lettres arabes dans la transcription : %s → %s", text, result)
    return result


async def transcribe(wav: bytes) -> str:
    global _client
    _client = _client or genai.Client(api_key=GEMINI_API_KEY)
    response = await _client.aio.models.generate_content(
        model=TRANSCRIBE_MODEL, contents=[types.Part.from_bytes(data=wav, mime_type="audio/wav")], config=CONFIG)
    if (usage := FLASH_USAGE.get()) is not None and (meta := response.usage_metadata):
        counts = usage.setdefault(TRANSCRIBE_MODEL, Counter())
        counts["input"] += meta.prompt_token_count or 0
        counts["output"] += meta.candidates_token_count or 0
    parts = response.candidates[0].content.parts if response.candidates and response.candidates[0].content else []
    return hebraized(" ".join(part.audio_transcription.text.strip() for part in parts or []
                              if part.audio_transcription and part.audio_transcription.text).strip())
