"""Textes de lecture des leçons 0.01 → 0.20, et tirage des extraits à lire."""

import random

from app.data_loader import get_dataset
from app.revision_agent.config import LAST_LESSON, LESSON_CHAPTER


def lesson_number(code: str) -> int | None:
    chapter, _, number = code.partition(".")
    return int(number) if chapter == LESSON_CHAPTER and number.isdigit() else None


def lessons_with_text() -> list[str]:
    """Codes des leçons du périmètre qui ont un texte de lecture, dans l'ordre."""
    texts = get_dataset("text")
    numbers = {code: lesson_number(code) for code, text in texts.items() if text.get("phrases")}
    return sorted((code for code, n in numbers.items() if n and n <= LAST_LESSON), key=numbers.get)


EXTRACTS_PER_SESSION = 4  # lectures dans une séance (moins si le texte est trop court)
MAX_PHRASES_PER_READING = 3  # phrases d'une lecture, au choix de l'élève (fenêtre « Configuration »)


def sample_reading(lessons: list[str]) -> tuple[str, str, list[str], int]:
    """Tire une leçon et la réplique où commencer à lire, pour que EXTRACTS_PER_SESSION lectures d'une réplique
    tiennent dans le texte : (leçon, titre, phrases, numéro de la première)."""
    lesson = random.choice(lessons)
    text = get_dataset("text")[lesson]
    phrases = [p["hebrew"] for p in text["phrases"]]
    return lesson, text.get("title") or "", phrases, random.randint(0, max(0, len(phrases) - EXTRACTS_PER_SESSION))
