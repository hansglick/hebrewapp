from fastapi import APIRouter, HTTPException

from app.exam import build_exam

router = APIRouter(prefix="/api", tags=["examens"])


@router.get("/examens/{code}")
def get_examen(code: str):
    exam = build_exam(code)
    if exam is None:
        raise HTTPException(404, "Leçon introuvable pour cet examen")
    return exam
