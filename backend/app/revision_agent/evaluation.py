"""Évaluation silencieuse d'une réponse par le prof, commune à la compréhension de texte et à l'expression libre :
notes de 0 à 5 étoiles, justifiées en français, et la réponse de l'élève toujours en hébreu (cf. demande explicite du
user)."""

import logging
import re

from app.revision_agent.translate import translate_to_french

log = logging.getLogger("revision_agent.evaluation")

MAX_STARS = 5
QUESTION_FALLBACK_SECONDS = 4  # si le prof n'a toujours pas commencé à poser la question
HEBREW_LETTER = re.compile(r"[א-ת]")
LATIN_LETTER = re.compile(r"[A-Za-zÀ-ÿ]")

STARS = {"type": "INTEGER", "description": "De 0 à 5 étoiles"}
JUSTIFICATION = {"type": "STRING",
                 "description": "En français, en une ou deux phrases courtes, pourquoi la note n'est pas de 5 étoiles "
                                "(vide si elle l'est)"}


async def french(text: str) -> str:
    """Texte destiné à l'élève : traduit s'il n'est pas en français (pas une lettre latine, ex. tout en hébreu)."""
    if not text or LATIN_LETTER.search(text):
        return text
    try:
        return await translate_to_french(text)
    except Exception:
        log.exception("Traduction impossible : %s", text)
        return text


def rating(stars, justification) -> dict:
    stars = max(0, min(MAX_STARS, int(stars))) if isinstance(stars, (int, float)) else 0
    return {"stars": stars, "justification": str(justification or "").strip() if stars < MAX_STARS else ""}


def hebrew_answer(answer, heard: str) -> str:
    """La réponse telle que le prof l'a rapportée ; s'il l'a écrite en lettres latines, ce que l'élève a dit d'après
    la transcription automatique (en hébreu) : la réponse s'affiche toujours en hébreu."""
    answer = str(answer or "").strip()
    if answer and not HEBREW_LETTER.search(answer) and HEBREW_LETTER.search(heard):
        log.info("réponse rapportée sans hébreu (%s) : transcription de l'élève à la place", answer)
        return heard.strip()
    return answer
