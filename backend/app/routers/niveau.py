from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel

from app.data_loader import get_dataset
from app.database import DEFAULT_USER_ID, get_connection

router = APIRouter(prefix="/api", tags=["niveau"])


class NiveauOut(BaseModel):
    level: str
    level_since: str
    jours_bloque: int
    next_lesson_code: str | None


class NiveauUpdate(BaseModel):
    level: str


def _jours_bloque(level_since: str) -> int:
    since = datetime.fromisoformat(level_since).replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - since).days


def _all_lesson_codes_in_order() -> list:
    chapitres = get_dataset("chapitre")
    codes = []
    for chap_id in sorted(chapitres.keys(), key=int):
        codes.extend(chapitres[chap_id]["lessons"])
    return codes


def _next_lesson_code(level: str):
    codes = _all_lesson_codes_in_order()
    if level not in codes:
        return None
    idx = codes.index(level)
    return codes[idx + 1] if idx + 1 < len(codes) else None


def _get_niveau_row(conn):
    return conn.execute(
        "SELECT level, level_since FROM user_level WHERE user_id = ?",
        (DEFAULT_USER_ID,),
    ).fetchone()


def _to_niveau_out(row) -> NiveauOut:
    return NiveauOut(
        level=row["level"],
        level_since=row["level_since"],
        jours_bloque=_jours_bloque(row["level_since"]),
        next_lesson_code=_next_lesson_code(row["level"]),
    )


@router.get("/niveau", response_model=NiveauOut)
def get_niveau():
    conn = get_connection()
    try:
        row = _get_niveau_row(conn)
        return _to_niveau_out(row)
    finally:
        conn.close()


@router.put("/niveau", response_model=NiveauOut)
def set_niveau(payload: NiveauUpdate):
    conn = get_connection()
    try:
        conn.execute(
            "UPDATE user_level SET level = ?, level_since = datetime('now') WHERE user_id = ?",
            (payload.level, DEFAULT_USER_ID),
        )
        conn.commit()
        row = _get_niveau_row(conn)
        return _to_niveau_out(row)
    finally:
        conn.close()
