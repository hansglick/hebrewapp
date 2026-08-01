from fastapi import APIRouter, Query
from pydantic import BaseModel, model_validator

from app.database import DEFAULT_USER_ID, get_connection

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
def create_evaluation(payload: EvaluationCreate):
    conn = get_connection()
    try:
        cursor = conn.execute(
            """
            INSERT INTO evaluations (user_id, object_type, object_key, success, score)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                DEFAULT_USER_ID,
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
            (DEFAULT_USER_ID, object_type, object_key, limit),
        ).fetchall()
        return [_row_to_out(row) for row in rows]
    finally:
        conn.close()
