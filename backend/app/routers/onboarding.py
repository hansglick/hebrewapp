import json
import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database import DEFAULT_USER_ID, get_connection, reset_account, set_user_level
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

# Bloc hébreu Unicode (lettres + niqqud + cantillation) + espaces — un pseudo
# n'a besoin de rien de plus, tout le reste est retiré silencieusement plutôt
# que rejeté (évite un aller-retour de validation gênant pour une simple
# saisie sur mobile).
_NON_HEBREW_RE = re.compile(r"[^֐-׿\s]")


def _sanitize_pseudo(raw: str) -> str:
    return _NON_HEBREW_RE.sub("", raw).strip()


@router.get("/status")
def onboarding_status():
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT pseudo, onboarding_completed_at FROM users WHERE id = ?", (DEFAULT_USER_ID,)
        ).fetchone()
    finally:
        conn.close()
    return {"needs_onboarding": row["onboarding_completed_at"] is None, "pseudo": row["pseudo"]}


class StartRequest(BaseModel):
    pseudo: str


@router.post("/exam/start")
def start_exam(payload: StartRequest):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM onboarding_exam_progress WHERE user_id = ?", (DEFAULT_USER_ID,)
        ).fetchone()
        if row is not None:
            return {
                "completed": False,
                "question_number": row["question_number"],
                "total_questions": TOTAL_QUESTIONS,
                "question": json.loads(row["current_question_json"]),
            }

        pseudo = _sanitize_pseudo(payload.pseudo)
        if not pseudo:
            raise HTTPException(400, "Pseudo invalide (caractères hébreux uniquement)")
        conn.execute("UPDATE users SET pseudo = ? WHERE id = ?", (pseudo, DEFAULT_USER_ID))

        oral_slots = pick_oral_slots()
        question = draw_question(STARTING_SET, 1 in oral_slots)
        conn.execute(
            """
            INSERT INTO onboarding_exam_progress
                (user_id, question_number, current_set, oral_slots_json, current_question_json, history_json)
            VALUES (?, 1, ?, ?, ?, ?)
            """,
            (DEFAULT_USER_ID, STARTING_SET, json.dumps(oral_slots), json.dumps(question), json.dumps([])),
        )
        conn.commit()
        return {"completed": False, "question_number": 1, "total_questions": TOTAL_QUESTIONS, "question": question}
    finally:
        conn.close()


@router.get("/exam/current")
def current_exam():
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM onboarding_exam_progress WHERE user_id = ?", (DEFAULT_USER_ID,)
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
def advance_exam(payload: AdvanceRequest):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM onboarding_exam_progress WHERE user_id = ?", (DEFAULT_USER_ID,)
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
            set_user_level(niveau)
            conn.execute(
                "UPDATE users SET onboarding_completed_at = datetime('now') WHERE id = ?", (DEFAULT_USER_ID,)
            )
            conn.execute("DELETE FROM onboarding_exam_progress WHERE user_id = ?", (DEFAULT_USER_ID,))
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
            (next_question_number, next_set_index, json.dumps(question), json.dumps(history), DEFAULT_USER_ID),
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


@router.post("/reset")
def reset_onboarding():
    reset_account()
    return {"status": "ok"}
