from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.auth import sanitize_pseudo
from app.database import login_user, register_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


class AuthRequest(BaseModel):
    pseudo: str
    pin: str


@router.post("/register")
def register(payload: AuthRequest):
    pseudo = sanitize_pseudo(payload.pseudo)
    if not pseudo:
        raise HTTPException(400, "Pseudo invalide (caractères hébreux uniquement)")
    if not payload.pin.isdigit() or len(payload.pin) != 4:
        raise HTTPException(400, "Le code doit contenir 4 chiffres")
    try:
        user_id = register_user(pseudo, payload.pin)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    return {"user_id": user_id}


@router.post("/login")
def login(payload: AuthRequest):
    pseudo = sanitize_pseudo(payload.pseudo)
    user_id = login_user(pseudo, payload.pin)
    if user_id is None:
        raise HTTPException(401, "Pseudo ou code incorrect")
    return {"user_id": user_id}
