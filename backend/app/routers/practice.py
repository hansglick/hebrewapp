from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.auth import get_current_user_id
from app.data_loader import get_dataset
from app.database import get_connection
from app.difficulty import (
    aggregate_by_base_key,
    compute_combo_difficulties,
    pick_sequential,
    weighted_pick,
)
from app.lesson_order import recency_weights
from app.quizz import build_quizz_question

router = APIRouter(prefix="/api", tags=["practice"])


class ObjectViewIn(BaseModel):
    object_type: str
    object_key: str


@router.post("/object-views")
def mark_object_seen(payload: ObjectViewIn, user_id: int = Depends(get_current_user_id)):
    """Marque un objet (mot/verbe/phrase/texte) comme vu au moins une fois —
    appelé en fire-and-forget par le frontend à chaque affichage, sert de
    signal pour la progression d'exploration d'une leçon (cf.
    chapters.get_lecon_exploration). Idempotent (INSERT OR IGNORE)."""
    conn = get_connection()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO object_views (user_id, object_type, object_key) VALUES (?, ?, ?)",
            (user_id, payload.object_type, payload.object_key),
        )
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}

DIRECTIONS = ("hebreu", "francais")
# Les deux sens sont tirables pour les phrases aussi (cf. DIRECTIONS
# plus haut) ; en révision, le user choisit explicitement lequel pratiquer
# via le sélecteur français/hébreu (le tirage est alors restreint à la strate
# du sens choisi, cf. `direction` dans random_phrase ci-dessous).
PHRASE_DIRECTIONS = ("hebreu", "francais")


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
    current: str | None = Query(None),
    user_id: int = Depends(get_current_user_id),
):
    lesson = _get_lesson(lesson_code)

    if mode == "exploration":
        pool = lesson["words"]
        key = pick_sequential(pool, current)
        langue = None
    else:
        # Chaque mot x langue a son propre suivi de difficulté (un mot peut
        # être facile à traduire vers le français mais difficile dans l'autre
        # sens) : on tire directement un combo mot+langue, sans agréger les
        # deux sens — c'est le système qui choisit le sens le plus difficile
        # pour ce mot, le user ne choisit plus.
        #
        # Tirage 50% pondéré par difficulté / 50% pondéré par récence dans la
        # progression du cours : chaque mot débloqué (global_words, déjà
        # cumulatif et incluant la leçon courante) reçoit le poids de récence
        # de SA PROPRE leçon d'origine (pas celle demandée en paramètre).
        words = get_dataset("word")
        weights_by_lesson = recency_weights(lesson_code)
        recency_pool = {}
        for w in lesson["global_words"]:
            word = words.get(w)
            if word is None:
                continue
            weight = weights_by_lesson.get(f"{word['chapter']}.{word['lesson']}")
            if weight is None:
                continue
            for d in DIRECTIONS:
                recency_pool[f"{w}|{d}"] = weight

        difficulty_pool = {
            k: v for k, v in compute_combo_difficulties("mot", user_id).items() if k in recency_pool
        }

        combo, pool = weighted_pick(difficulty_pool, recency_pool)
        if combo is None:
            key = langue = None
        else:
            key, langue = combo.rsplit("|", 1)

    if key is None:
        raise HTTPException(404, "Aucun mot disponible pour ce tirage")

    words = get_dataset("word")
    word = words.get(key)
    if word is None:
        raise HTTPException(404, "Mot introuvable")
    result = {**word, "key": key}
    if langue is not None:
        result["langue"] = langue
        result["pool"] = pool
    return result


@router.get("/verbes/random")
def random_verbe(
    lesson_code: str = Query(...),
    mode: Literal["exploration", "revision"] = Query("exploration"),
    current: str | None = Query(None),
    user_id: int = Depends(get_current_user_id),
):
    lesson = _get_lesson(lesson_code)

    if mode == "exploration":
        pool = lesson["verbs"]
        key = pick_sequential(pool, current)
        draw_pool = None
    else:
        verbes_data = get_dataset("verbe")
        weights_by_lesson = recency_weights(lesson_code)
        recency_pool = {}
        for v in lesson["global_verbs"]:
            verbe_data = verbes_data.get(v)
            if verbe_data is None:
                continue
            weight = weights_by_lesson.get(f"{verbe_data['chapter']}.{verbe_data['lesson']}")
            if weight is None:
                continue
            recency_pool[v] = weight

        difficulty_pool_raw = aggregate_by_base_key(compute_combo_difficulties("verbe", user_id))
        difficulty_pool = {k: v for k, v in difficulty_pool_raw.items() if k in recency_pool}

        key, draw_pool = weighted_pick(difficulty_pool, recency_pool)

    if key is None:
        raise HTTPException(404, "Aucun verbe disponible pour ce tirage")

    verbe = _enrich_verbe(key)
    if verbe is None:
        raise HTTPException(404, "Verbe introuvable")
    if draw_pool is not None:
        verbe["pool"] = draw_pool
    return verbe


def _enrich_verbe(key: str) -> dict | None:
    verbes = get_dataset("verbe")
    verbe = verbes.get(key)
    if verbe is None:
        return None
    binyans = get_dataset("binyan")
    binyan_color = binyans.get(verbe.get("binyan"), {}).get("color")
    return {**verbe, "key": key, "binyan_color": binyan_color}


@router.get("/verbes/{key}")
def get_verbe(key: str):
    verbe = _enrich_verbe(key)
    if verbe is None:
        raise HTTPException(404, "Verbe introuvable")
    return verbe


@router.get("/quizz/random")
def random_quizz(lesson_code: str = Query(...), user_id: int = Depends(get_current_user_id)):
    result = build_quizz_question(lesson_code, user_id)
    if result is None:
        raise HTTPException(404, "Aucun objet de vocabulaire disponible pour ce tirage")
    return result


@router.get("/phrases/random")
def random_phrase(
    lesson_code: str = Query(...),
    mode: Literal["exploration", "revision"] = Query("exploration"),
    current: str | None = Query(None),
    direction: Literal["hebreu", "francais"] | None = Query(None),
    user_id: int = Depends(get_current_user_id),
):
    phrases_data = get_dataset("phrase")

    if mode == "exploration":
        pool = phrases_data.get(lesson_code, [])
        if not pool:
            raise HTTPException(404, "Aucune phrase disponible pour cette leçon")
        current_position = int(current) if current is not None and current.lstrip("-").isdigit() else None
        position = pick_sequential(list(range(len(pool))), current_position)
        chosen_lesson_code = lesson_code
        direction = None
        draw_pool = None
    else:
        lesson = _get_lesson(lesson_code)

        # Le user choisit explicitement le sens à pratiquer (français ou
        # hébreu, cf. le sélecteur en révision) : le tirage est alors
        # restreint à la strate de ce seul sens — jamais de mélange des deux
        # directions dans un même tirage. Sans `direction` fourni (appel
        # direct de l'API), on retombe sur les deux sens mélangés.
        #
        # `global_phrases` liste des lesson_code (pas des phrases directement)
        # et est déjà cumulative (inclut lesson_code lui-même) : chaque phrase
        # reçoit le poids de récence de la leçon à laquelle elle appartient.
        directions = (direction,) if direction is not None else PHRASE_DIRECTIONS
        weights_by_lesson = recency_weights(lesson_code)
        recency_pool = {}
        for lc in lesson.get("global_phrases", []):
            weight = weights_by_lesson.get(lc)
            if weight is None:
                continue
            for i in range(len(phrases_data.get(lc, []))):
                for d in directions:
                    recency_pool[f"{lc}|{i}|{d}"] = weight

        difficulty_pool = {
            k: v for k, v in compute_combo_difficulties("phrase_auto", user_id).items() if k in recency_pool
        }

        picked, draw_pool = weighted_pick(difficulty_pool, recency_pool)
        if picked is None:
            raise HTTPException(404, "Aucune phrase disponible pour ce tirage")

        chosen_lesson_code, position_str, direction = picked.split("|")
        position = int(position_str)

    pool = phrases_data[chosen_lesson_code]
    phrase = pool[position]
    result = {**phrase, "position": position, "lesson_code": chosen_lesson_code}
    if direction is not None:
        result["direction"] = direction
        result["pool"] = draw_pool
    return result
