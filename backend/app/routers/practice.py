import random
from collections import defaultdict
from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from app.data_loader import get_dataset
from app.difficulty import (
    aggregate_by_base_key,
    compute_combo_difficulties,
    stratified_pick,
)

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

    if mode == "exploration":
        pool = lesson["words"]
        key = random.choice(pool) if pool else None
    else:
        difficulties = aggregate_by_base_key(compute_combo_difficulties("mot"))
        key = stratified_pick(lesson["words"], lesson["global_words"], difficulties)

    if key is None:
        raise HTTPException(404, "Aucun mot disponible pour ce tirage")

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

    if mode == "exploration":
        pool = lesson["verbs"]
        key = random.choice(pool) if pool else None
    else:
        difficulties = aggregate_by_base_key(compute_combo_difficulties("verbe"))
        key = stratified_pick(lesson["verbs"], lesson["global_verbs"], difficulties)

    if key is None:
        raise HTTPException(404, "Aucun verbe disponible pour ce tirage")

    verbes = get_dataset("verbe")
    verbe = verbes.get(key)
    if verbe is None:
        raise HTTPException(404, "Verbe introuvable")

    binyans = get_dataset("binyan")
    binyan_color = binyans.get(verbe.get("binyan"), {}).get("color")
    return {**verbe, "key": key, "binyan_color": binyan_color}


@router.get("/phrases/random")
def random_phrase(
    lesson_code: str = Query(...),
    mode: Literal["exploration", "revision"] = Query("exploration"),
):
    phrases_data = get_dataset("phrase")

    if mode == "exploration":
        pool = phrases_data.get(lesson_code, [])
        if not pool:
            raise HTTPException(404, "Aucune phrase disponible pour cette leçon")
        position = random.randrange(len(pool))
        chosen_lesson_code = lesson_code
    else:
        lesson = _get_lesson(lesson_code)

        own_keys = [f"{lesson_code}|{i}" for i in range(len(phrases_data.get(lesson_code, [])))]
        cumulative_keys = []
        for lc in lesson.get("global_phrases", []):
            cumulative_keys.extend(f"{lc}|{i}" for i in range(len(phrases_data.get(lc, []))))

        # La difficulté est suivie par combo [phrase x langue] (object_key =
        # "lesson_code|position|direction") mais le choix de la PHRASE à tirer
        # ignore la direction : on agrège les deux directions d'une même phrase.
        raw_difficulties = compute_combo_difficulties("phrase_auto")
        base_difficulties = defaultdict(float)
        for key, value in raw_difficulties.items():
            lc, pos, _direction = key.split("|")
            base_difficulties[f"{lc}|{pos}"] += value

        picked = stratified_pick(own_keys, cumulative_keys, dict(base_difficulties))
        if picked is None:
            raise HTTPException(404, "Aucune phrase disponible pour ce tirage")

        chosen_lesson_code, position_str = picked.rsplit("|", 1)
        position = int(position_str)

    pool = phrases_data[chosen_lesson_code]
    phrase = pool[position]
    return {**phrase, "position": position, "lesson_code": chosen_lesson_code}
