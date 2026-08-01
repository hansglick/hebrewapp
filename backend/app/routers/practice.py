import random
from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from app.data_loader import get_dataset

router = APIRouter(prefix="/api", tags=["practice"])


def _get_lesson(lesson_code: str) -> dict:
    lessons = get_dataset("lesson")
    lesson = lessons.get(lesson_code)
    if lesson is None:
        raise HTTPException(404, "Leçon introuvable")
    return lesson


@router.get("/mots/random")
def random_mot(
    lesson_code: str = Query(...),
    mode: Literal["exploration", "revision"] = Query("exploration"),
):
    lesson = _get_lesson(lesson_code)
    pool = lesson["words"] if mode == "exploration" else lesson["global_words"]
    if not pool:
        raise HTTPException(404, "Aucun mot disponible pour ce tirage")

    key = random.choice(pool)
    words = get_dataset("word")
    word = words.get(key)
    if word is None:
        raise HTTPException(404, "Mot introuvable")
    return {**word, "key": key}


@router.get("/verbes/random")
def random_verbe(
    lesson_code: str = Query(...),
    mode: Literal["exploration", "revision"] = Query("exploration"),
):
    lesson = _get_lesson(lesson_code)
    pool = lesson["verbs"] if mode == "exploration" else lesson["global_verbs"]
    if not pool:
        raise HTTPException(404, "Aucun verbe disponible pour ce tirage")

    key = random.choice(pool)
    verbes = get_dataset("verbe")
    verbe = verbes.get(key)
    if verbe is None:
        raise HTTPException(404, "Verbe introuvable")

    binyans = get_dataset("binyan")
    binyan_color = binyans.get(verbe.get("binyan"), {}).get("color")
    return {**verbe, "key": key, "binyan_color": binyan_color}


@router.get("/phrases/random")
def random_phrase(lesson_code: str = Query(...)):
    phrases = get_dataset("phrase")
    pool = phrases.get(lesson_code, [])
    if not pool:
        raise HTTPException(404, "Aucune phrase disponible pour cette leçon")

    position = random.randrange(len(pool))
    phrase = pool[position]
    return {**phrase, "position": position, "lesson_code": lesson_code}
