from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth import get_current_user_id
from app.database import get_connection, set_user_level
from app.lesson_order import next_lesson_code, reference_lesson

router = APIRouter(prefix="/api", tags=["niveau"])


class NiveauOut(BaseModel):
    level: str
    level_since: str
    jours_bloque: int
    next_lesson_code: str | None
    # Leçon débloquée la plus avancée (= niveau + 1, jamais None tant que le
    # cours a au moins une leçon) — à utiliser comme leçon de référence pour
    # le tirage des révisions/examens et pour déterminer les leçons
    # débloquées à l'affichage, cf. app.lesson_order.reference_lesson.
    reference_lesson: str | None


class NiveauUpdate(BaseModel):
    level: str


def _jours_bloque(level_since: str) -> int:
    since = datetime.fromisoformat(level_since).replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - since).days


def _get_niveau_row(conn, user_id: int):
    return conn.execute(
        "SELECT level, level_since FROM user_level WHERE user_id = ?",
        (user_id,),
    ).fetchone()


def _to_niveau_out(row) -> NiveauOut:
    return NiveauOut(
        level=row["level"],
        level_since=row["level_since"],
        jours_bloque=_jours_bloque(row["level_since"]),
        next_lesson_code=next_lesson_code(row["level"]),
        reference_lesson=reference_lesson(row["level"]),
    )


@router.get("/niveau", response_model=NiveauOut)
def get_niveau(user_id: int = Depends(get_current_user_id)):
    conn = get_connection()
    try:
        row = _get_niveau_row(conn, user_id)
        return _to_niveau_out(row)
    finally:
        conn.close()


@router.put("/niveau", response_model=NiveauOut)
def set_niveau(payload: NiveauUpdate, user_id: int = Depends(get_current_user_id)):
    set_user_level(user_id, payload.level)
    conn = get_connection()
    try:
        row = _get_niveau_row(conn, user_id)
        return _to_niveau_out(row)
    finally:
        conn.close()
