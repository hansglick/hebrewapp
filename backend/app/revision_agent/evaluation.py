"""Évaluation silencieuse d'une réponse par le prof, commune à la compréhension de texte et à l'expression libre :
fautes commentées en français (sans note), et la réponse de l'élève toujours en hébreu (cf. demande explicite du
user)."""

import json
import logging
import re

from app.revision_agent.config import FRENCH_SPEECH_MODEL
from app.revision_agent.translate import translate

log = logging.getLogger("revision_agent.evaluation")

QUESTION_FALLBACK_SECONDS = 4  # si le prof n'a toujours pas commencé à poser la question
HEBREW_LETTER = re.compile(r"[א-ת]")
LATIN_LETTER = re.compile(r"[A-Za-zÀ-ÿ]")
NIKKUD = re.compile(r"[֑-ׇ]")
HEBREW_RUN = re.compile(r"[א-ת֑-ׇ]+")
# Lettres qui se prononcent pareil en hébreu moderne, et lettres finales : ramenées à une seule, pour retrouver à
# l'oreille un mot que le prof a écrit de deux façons (תשים / טסים).
HOMOPHONES = str.maketrans("טסחקעךםןףץ", "תשככאכמנפצ")


# Le prof écrit parfois ses commentaires en hébreu (en mode hébreu), ou cite des mots hébreux en lettres latines
# (« le verbe mitrahetz ») : interdit à l'écran (cf. demande explicite du user). Un seul appel les remet tous d'aplomb.
FRENCH_TEXTS_PROMPT = """Voici les commentaires qu'un professeur d'hébreu a écrits pour corriger la phrase de son
élève débutant, francophone. Pour chaque texte de la liste, dans le même ordre :
- s'il n'est pas en français, traduis-le en français, fidèlement, en tutoyant l'élève ;
- s'il est déjà en français, recopie-le tel quel ;
- dans tous les cas, tout mot, forme, expression ou lettre hébreux cité s'écrit en écriture hébraïque, sans nikkoud,
  jamais en lettres latines : « le verbe mitrahetz » → « le verbe מתרחץ », « yesh li » → « יש לי », « la lettre
  lamed » → « la lettre ל », « au féminin, mitrahetzet » → « au féminin, מתרחצת ». Ne change rien d'autre.
Renvoie exactement autant de textes qu'on t'en donne."""

FRENCH_TEXTS_SCHEMA = {
    "type": "OBJECT",
    "properties": {"textes": {"type": "ARRAY", "items": {"type": "STRING"}}},
    "required": ["textes"],
}


async def french_texts(texts: list[str]) -> list[str]:
    """Textes destinés à l'élève (commentaires) : en français, l'hébreu cité en écriture hébraïque."""
    indexes = [i for i, text in enumerate(texts) if text]
    if not indexes:
        return texts
    try:
        request = json.dumps([texts[i] for i in indexes], ensure_ascii=False)
        result = json.loads(await translate(request, FRENCH_TEXTS_PROMPT, FRENCH_TEXTS_SCHEMA, FRENCH_SPEECH_MODEL))
        rewritten = [str(text).strip() for text in result.get("textes") or []]
    except Exception:
        log.exception("Réécriture impossible : %s", texts)
        return texts
    if len(rewritten) != len(indexes) or not all(rewritten):
        log.warning("Réécriture incomplète : %s → %s", texts, rewritten)
        return texts
    texts = list(texts)
    for i, text in zip(indexes, rewritten):
        texts[i] = text
    return texts


def letters(word: str) -> str:
    return re.sub(r"[^א-ת]", "", NIKKUD.sub("", word))


def align_error_words(answer: str, errors: list[dict]) -> str:
    """La réponse, dont chaque mot fautif est écrit comme dans son commentaire (cf. demande explicite du user).

    Le prof n'a que le son : il écrit parfois un même mot de deux façons, l'une dans la réponse (תשים, homophone
    existant), l'autre, celle du mot voulu, dans le commentaire (טסים). Un mot fautif introuvable dans la réponse y est
    cherché à l'oreille (HOMOPHONES) et, trouvé, prend la graphie du commentaire : la réponse reste cohérente et le mot
    est surligné."""
    tokens = answer.split(" ")
    keys = [letters(token) for token in tokens]
    for error in errors:
        parts = [letters(part) for part in error["word"].split()]
        parts = [part for part in parts if part]
        n = len(parts)
        if not n or any(keys[i:i + n] == parts for i in range(len(keys) - n + 1)):
            continue
        sound = [part.translate(HOMOPHONES) for part in parts]
        for i in range(len(keys) - n + 1):
            if [key.translate(HOMOPHONES) for key in keys[i:i + n]] == sound:
                log.info("mot fautif réécrit dans la réponse : %s → %s", " ".join(tokens[i:i + n]), error["word"])
                for j, part in enumerate(parts):
                    tokens[i + j] = HEBREW_RUN.sub(part, tokens[i + j], count=1)
                    keys[i + j] = part
                break
    return " ".join(tokens)


def hebrew_answer(answer, heard: str) -> str:
    """La réponse telle que le prof l'a rapportée ; s'il l'a écrite en lettres latines, ce que l'élève a dit d'après
    la transcription automatique (en hébreu) : la réponse s'affiche toujours en hébreu."""
    answer = str(answer or "").strip()
    if answer and not HEBREW_LETTER.search(answer) and HEBREW_LETTER.search(heard):
        log.info("réponse rapportée sans hébreu (%s) : transcription de l'élève à la place", answer)
        return heard.strip()
    return answer
