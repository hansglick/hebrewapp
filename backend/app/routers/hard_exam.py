import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user_id
from app.database import get_connection
from app.hard_exam import N_QUESTIONS, PASS_THRESHOLD, RATING_THRESHOLD, TIMER_SECONDS, is_unlocked
from app.lesson_order import reference_lesson
from app.hard_exam_session import (
    AlreadyAnswered,
    NotUnlocked,
    abandon_session,
    get_or_create_session,
    record_answer,
)
from app.wallet import HARD_EXAM_BONUS_POINTS

router = APIRouter(prefix="/api", tags=["hard_exam"])


def _current_reference_lesson(conn, user_id: int) -> str:
    row = conn.execute("SELECT level FROM user_level WHERE user_id = ?", (user_id,)).fetchone()
    return reference_lesson(row["level"])


@router.get("/examens/hard/status")
def get_hard_exam_status(user_id: int = Depends(get_current_user_id)):
    conn = get_connection()
    try:
        unlocked = is_unlocked(conn, user_id)
        session_exists = (
            conn.execute("SELECT 1 FROM hard_exam_sessions WHERE user_id = ?", (user_id,)).fetchone()
            is not None
        )
    finally:
        conn.close()
    return {
        "unlocked": unlocked,
        "session_exists": session_exists,
        "pass_threshold": PASS_THRESHOLD,
        "total_questions": N_QUESTIONS,
        "timer_minutes": TIMER_SECONDS // 60,
        "points_a_gagner": HARD_EXAM_BONUS_POINTS,
    }


@router.get("/examens/hard")
def get_hard_exam(user_id: int = Depends(get_current_user_id)):
    conn = get_connection()
    try:
        current_level = _current_reference_lesson(conn, user_id)
        try:
            questions, answers, created_at, paused_seconds = get_or_create_session(conn, user_id, current_level)
        except NotUnlocked:
            raise HTTPException(403, "Le hard exam n'est pas déverrouillé")
    finally:
        conn.close()
    return {
        "pass_threshold": PASS_THRESHOLD,
        "rating_threshold": RATING_THRESHOLD,
        "total_questions": len(questions),
        "questions": questions,
        "answers": answers,
        "created_at": created_at,
        "paused_seconds": paused_seconds,
        "timer_seconds": TIMER_SECONDS,
    }


class HardExamAnswerRequest(BaseModel):
    question_index: int
    answer: dict
    pause_seconds: float = 0.0


@router.post("/examens/hard/answer")
def answer_hard_exam(payload: HardExamAnswerRequest, user_id: int = Depends(get_current_user_id)):
    conn = get_connection()
    try:
        try:
            result = record_answer(conn, user_id, payload.question_index, payload.answer, payload.pause_seconds)
        except AlreadyAnswered:
            raise HTTPException(409, "Cette question a déjà été notée")
        except ValueError:
            raise HTTPException(400, "question_index invalide")
    finally:
        conn.close()

    if result is None:
        raise HTTPException(404, "Aucune tentative de hard exam en cours")
    return result


@router.get("/examens/hard/copies/{attempt_id}")
def get_hard_exam_copie(attempt_id: int, user_id: int = Depends(get_current_user_id)):
    conn = get_connection()
    try:
        row = conn.execute(
            """
            SELECT id, passed, score_ratio, average_note, questions_json, answers_json, attempted_at
            FROM hard_exam_attempts WHERE user_id = ? AND id = ?
            """,
            (user_id, attempt_id),
        ).fetchone()
    finally:
        conn.close()

    if row is None:
        raise HTTPException(404, "Copie introuvable")

    return {
        "id": row["id"],
        "date": row["attempted_at"],
        "passed": bool(row["passed"]),
        "average_note": row["average_note"],
        "success_ratio": row["score_ratio"],
        "questions": json.loads(row["questions_json"]),
        "answers": json.loads(row["answers_json"]),
    }


@router.post("/examens/hard/abandon")
def abandon_hard_exam(user_id: int = Depends(get_current_user_id)):
    conn = get_connection()
    try:
        result = abandon_session(conn, user_id)
    finally:
        conn.close()

    if result is None:
        raise HTTPException(404, "Aucune tentative de hard exam en cours")
    return result
