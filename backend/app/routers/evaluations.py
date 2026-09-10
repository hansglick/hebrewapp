from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, model_validator

from app.auth import get_current_user_id
from app.database import get_connection

router = APIRouter(prefix="/api", tags=["evaluations"])


class EvaluationCreate(BaseModel):
    object_type: str
    object_key: str
    success: bool | None = None
    score: int | None = None

    @model_validator(mode="after")
    def check_exactly_one(self):
        if (self.success is None) == (self.score is None):
            raise ValueError("Fournir exactement un des deux champs : success ou score")
        return self


class EvaluationOut(BaseModel):
    id: int
    object_type: str
    object_key: str
    success: bool | None
    score: int | None
    created_at: str


class EvaluationStatsOut(BaseModel):
    count: int
    percent: int | None
    success_count: int | None


def _row_to_out(row) -> EvaluationOut:
    return EvaluationOut(
        id=row["id"],
        object_type=row["object_type"],
        object_key=row["object_key"],
        success=bool(row["success"]) if row["success"] is not None else None,
        score=row["score"],
        created_at=row["created_at"],
    )


@router.post("/evaluations", response_model=EvaluationOut)
def create_evaluation(payload: EvaluationCreate, user_id: int = Depends(get_current_user_id)):
    conn = get_connection()
    try:
        cursor = conn.execute(
            """
            INSERT INTO evaluations (user_id, object_type, object_key, success, score)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                user_id,
                payload.object_type,
                payload.object_key,
                int(payload.success) if payload.success is not None else None,
                payload.score,
            ),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM evaluations WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
        return _row_to_out(row)
    finally:
        conn.close()


@router.get("/evaluations", response_model=list[EvaluationOut])
def list_evaluations(
    object_type: str = Query(...),
    object_key: str = Query(...),
    limit: int = Query(5, ge=1, le=50),
    user_id: int = Depends(get_current_user_id),
):
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT * FROM evaluations
            WHERE user_id = ? AND object_type = ? AND object_key = ?
            ORDER BY created_at DESC, id DESC
            LIMIT ?
            """,
            (user_id, object_type, object_key, limit),
        ).fetchall()
        return [_row_to_out(row) for row in rows]
    finally:
        conn.close()


# Performance récente sur un TYPE d'item (tous object_key confondus, ex:
# "mot"), pas sur un item précis — cf. bulle "PERF." des écrans révisions,
# demande explicite du user. Seules les évaluations à réponse booléenne
# (success) comptent : les évaluations notées (score, ex: oral) n'ont pas
# leur place dans un % de bonnes réponses.
@router.get("/evaluations/stats", response_model=EvaluationStatsOut)
def evaluation_stats(
    object_type: str = Query(...),
    limit: int = Query(10, ge=1, le=50),
    user_id: int = Depends(get_current_user_id),
):
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT success FROM evaluations
            WHERE user_id = ? AND object_type = ? AND success IS NOT NULL
            ORDER BY created_at DESC, id DESC
            LIMIT ?
            """,
            (user_id, object_type, limit),
        ).fetchall()
        count = len(rows)
        if count < limit:
            return EvaluationStatsOut(count=count, percent=None, success_count=None)
        success_count = sum(1 for row in rows if row["success"])
        return EvaluationStatsOut(
            count=count, percent=round(success_count / count * 100), success_count=success_count
        )
    finally:
        conn.close()
