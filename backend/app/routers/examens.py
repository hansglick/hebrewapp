from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database import DEFAULT_USER_ID, get_connection, set_user_level
from app.exam import build_exam
from app.oral_exam import build_oral_exam

router = APIRouter(prefix="/api", tags=["examens"])


@router.get("/examens/{code}")
def get_examen(code: str):
    exam = build_exam(code)
    if exam is None:
        raise HTTPException(404, "Leçon introuvable pour cet examen")
    return exam


@router.get("/examens/{code}/oral")
def get_examen_oral(code: str):
    exam = build_oral_exam(code)
    if exam is None:
        raise HTTPException(404, "Leçon introuvable pour cet examen")
    return exam


def _passed_exam_types(conn, code: str) -> set:
    rows = conn.execute(
        "SELECT exam_type FROM exam_progress WHERE user_id = ? AND lesson_code = ?",
        (DEFAULT_USER_ID, code),
    ).fetchall()
    return {row["exam_type"] for row in rows}


@router.get("/examens/{code}/status")
def get_examen_status(code: str):
    conn = get_connection()
    try:
        passed_types = _passed_exam_types(conn, code)
    finally:
        conn.close()
    return {
        "ecrit_passed": "ecrit" in passed_types,
        "oral_passed": "oral" in passed_types,
    }


class ExamPassRequest(BaseModel):
    exam_type: str  # "ecrit" | "oral"
    offline: bool = False


@router.post("/examens/{code}/pass")
def pass_examen(code: str, payload: ExamPassRequest):
    if payload.exam_type not in ("ecrit", "oral"):
        raise HTTPException(400, "exam_type invalide")

    conn = get_connection()
    try:
        conn.execute(
            """
            INSERT INTO exam_progress (user_id, lesson_code, exam_type, passed_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(user_id, lesson_code, exam_type)
            DO UPDATE SET passed_at = excluded.passed_at
            """,
            (DEFAULT_USER_ID, code, payload.exam_type),
        )
        conn.commit()
        passed_types = _passed_exam_types(conn, code)
    finally:
        conn.close()

    niveau_updated = False
    if payload.exam_type == "ecrit" and payload.offline:
        set_user_level(code)
        niveau_updated = True
    elif {"ecrit", "oral"} <= passed_types:
        set_user_level(code)
        niveau_updated = True

    return {
        "niveau_updated": niveau_updated,
        "ecrit_passed": "ecrit" in passed_types,
        "oral_passed": "oral" in passed_types,
    }
