"""Vocabulaire (mots + verbes) déjà introduit au user jusqu'à un niveau
donné — sert à calibrer le vocabulaire attendu d'un outil externe (ex: la
persona de la conversation en direct, instructions/testlive) sur ce que
l'étudiant a réellement déjà vu, plutôt que tout le cours."""

from app.data_loader import get_dataset
from app.lesson_order import all_lesson_codes_in_order


def _lesson_code_of(item: dict) -> str:
    return f"{item['chapter']}.{item['lesson']}"


def vocabulaire_jusqu_a(level: str) -> dict:
    """{"words": [...], "verbs": [...]} — formes non-vocalisées (clé du
    dataset, identique à `pure`) de tout mot/verbe dont la leçon
    d'introduction (`chapter`.`lesson` dans item_word.json/item_verbe.json)
    se situe entre la toute première leçon du cours et `level` inclus, dans
    l'ordre global du cursus (pas par numéro de chapitre/leçon brut).

    Lève ValueError si `level` n'est pas une leçon du cursus."""
    codes = all_lesson_codes_in_order()
    if level not in codes:
        raise ValueError(f"Niveau inconnu : {level!r}")
    unlocked = set(codes[: codes.index(level) + 1])

    words_data = get_dataset("word")
    verbes_data = get_dataset("verbe")

    words = [key for key, item in words_data.items() if _lesson_code_of(item) in unlocked]
    verbs = [key for key, item in verbes_data.items() if _lesson_code_of(item) in unlocked]

    return {"words": words, "verbs": verbs}


def mots_et_verbes_recents(lesson_code: str, last_n: int) -> tuple[list, list]:
    """(words_list, verbs_list) — formes non-vocalisées de tout mot/verbe
    dont la leçon d'introduction se situe dans la fenêtre des `last_n`
    leçons précédant `lesson_code`, plus `lesson_code` lui-même (fenêtre de
    last_n + 1 leçons au total), dans l'ordre global du cursus. Si moins de
    `last_n` leçons précèdent `lesson_code`, la fenêtre est simplement
    tronquée au début du cursus.

    Exclut les entrées avec value == -1 (jamais réellement introduites dans
    une leçon — un sentinel du dataset, pas une vraie leçon d'apparition).

    Lève ValueError si `lesson_code` n'est pas une leçon du cursus."""
    codes = all_lesson_codes_in_order()
    if lesson_code not in codes:
        raise ValueError(f"Leçon inconnue : {lesson_code!r}")
    idx = codes.index(lesson_code)
    window = set(codes[max(0, idx - last_n) : idx + 1])

    words_data = get_dataset("word")
    verbes_data = get_dataset("verbe")

    def in_window(item: dict) -> bool:
        return item.get("value") != -1 and _lesson_code_of(item) in window

    words_list = [key for key, item in words_data.items() if in_window(item)]
    verbs_list = [key for key, item in verbes_data.items() if in_window(item)]

    return words_list, verbs_list
