"""Textes de lecture des leçons 0.01 → 0.20, et tirage du passage à lire."""

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


def candidate_lessons(lesson: str, current: bool, previous: bool) -> list[str]:
    """Leçons où tirer le passage : la leçon choisie et/ou les leçons antérieures, selon les cases cochées."""
    selected = lesson_number(lesson)
    if selected is None:
        return []
    return [code for code in lessons_with_text()
            if (current and lesson_number(code) == selected) or (previous and lesson_number(code) < selected)]


def sample_passage(lessons: list[str]) -> tuple[str, list[str], list[str]]:
    """Tire une leçon, puis 1 à 3 phrases consécutives de son texte : (leçon, hébreu, français)."""
    lesson = random.choice(lessons)
    phrases = get_dataset("text")[lesson]["phrases"]
    n = random.randint(1, min(3, len(phrases)))
    start = random.randint(0, len(phrases) - n)
    window = phrases[start : start + n]
    return lesson, [p["hebrew"] for p in window], [p["french"] for p in window]
