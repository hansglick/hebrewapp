import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user_id
from app.database import DEFAULT_LEVEL, get_connection, reset_account, set_user_level
from app.lesson_order import reference_lesson
from app.onboarding_exam import (
    STARTING_SET,
    TOTAL_QUESTIONS,
    draw_question,
    final_set,
    next_set,
    niveau_from_final_set,
    pick_oral_slots,
    score_from_result,
)

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])


@router.get("/status")
def onboarding_status(user_id: int = Depends(get_current_user_id)):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT pseudo, onboarding_completed_at FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    finally:
        conn.close()
    return {"needs_onboarding": row["onboarding_completed_at"] is None, "pseudo": row["pseudo"]}


@router.post("/exam/start")
def start_exam(user_id: int = Depends(get_current_user_id)):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM onboarding_exam_progress WHERE user_id = ?", (user_id,)
        ).fetchone()
        if row is not None:
            return {
                "completed": False,
                "question_number": row["question_number"],
                "total_questions": TOTAL_QUESTIONS,
                "question": json.loads(row["current_question_json"]),
            }

        oral_slots = pick_oral_slots()
        question = draw_question(STARTING_SET, 1 in oral_slots)
        conn.execute(
            """
            INSERT INTO onboarding_exam_progress
                (user_id, question_number, current_set, oral_slots_json, current_question_json, history_json)
            VALUES (?, 1, ?, ?, ?, ?)
            """,
            (user_id, STARTING_SET, json.dumps(oral_slots), json.dumps(question), json.dumps([])),
        )
        conn.commit()
        return {"completed": False, "question_number": 1, "total_questions": TOTAL_QUESTIONS, "question": question}
    finally:
        conn.close()


@router.get("/exam/current")
def current_exam(user_id: int = Depends(get_current_user_id)):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM onboarding_exam_progress WHERE user_id = ?", (user_id,)
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return {"in_progress": False}
    return {
        "in_progress": True,
        "question_number": row["question_number"],
        "total_questions": TOTAL_QUESTIONS,
        "question": json.loads(row["current_question_json"]),
    }


class AdvanceRequest(BaseModel):
    question_number: int
    kind: str  # "ecrit" | "oral" — la question réellement répondue (peut différer
    # du tirage oral initialement désigné si aucun contenu oral n'était disponible
    result: dict


@router.post("/exam/advance")
def advance_exam(payload: AdvanceRequest, user_id: int = Depends(get_current_user_id)):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM onboarding_exam_progress WHERE user_id = ?", (user_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(404, "Aucun examen d'entrée en cours")
        if payload.question_number != row["question_number"]:
            raise HTTPException(409, "Cette question a déjà été traitée")

        score = score_from_result(payload.kind, payload.result)
        history = json.loads(row["history_json"])
        history.append(
            {"question_number": payload.question_number, "set": row["current_set"], "kind": payload.kind, "score": score}
        )

        if payload.question_number >= TOTAL_QUESTIONS:
            final = final_set(row["current_set"], score)
            niveau = niveau_from_final_set(final)
            set_user_level(user_id, niveau)
            conn.execute(
                "UPDATE users SET onboarding_completed_at = datetime('now') WHERE id = ?", (user_id,)
            )
            conn.execute("DELETE FROM onboarding_exam_progress WHERE user_id = ?", (user_id,))
            conn.commit()
            return {
                "completed": True,
                "niveau": niveau,
                "reference_lesson": reference_lesson(niveau),
                "history": history,
            }

        next_question_number = payload.question_number + 1
        next_set_index = next_set(row["current_set"], score)
        oral_slots = json.loads(row["oral_slots_json"])
        question = draw_question(next_set_index, next_question_number in oral_slots)

        conn.execute(
            """
            UPDATE onboarding_exam_progress
            SET question_number = ?, current_set = ?, current_question_json = ?, history_json = ?
            WHERE user_id = ?
            """,
            (next_question_number, next_set_index, json.dumps(question), json.dumps(history), user_id),
        )
        conn.commit()
        return {
            "completed": False,
            "question_number": next_question_number,
            "total_questions": TOTAL_QUESTIONS,
            "question": question,
        }
    finally:
        conn.close()


@router.post("/skip")
def skip_onboarding(user_id: int = Depends(get_current_user_id)):
    """Bouton "Commencez au niveau débutant" — même effet de bord que la fin
    de l'examen (advance_exam, branche completed) mais sans passer par les 7
    questions."""
    set_user_level(user_id, DEFAULT_LEVEL)
    conn = get_connection()
    try:
        conn.execute("UPDATE users SET onboarding_completed_at = datetime('now') WHERE id = ?", (user_id,))
        conn.execute("DELETE FROM onboarding_exam_progress WHERE user_id = ?", (user_id,))
        conn.commit()
    finally:
        conn.close()
    return {"reference_lesson": reference_lesson(DEFAULT_LEVEL)}


@router.post("/reset")
def reset_onboarding(user_id: int = Depends(get_current_user_id)):
    reset_account(user_id)
    return {"status": "ok"}
