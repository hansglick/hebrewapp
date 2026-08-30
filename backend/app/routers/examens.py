import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user_id
from app.data_loader import get_dataset
from app.database import get_connection
from app.exam import QUESTIONS as ECRIT_QUESTIONS
from app.exam import TIMER_SECONDS, build_exam
from app.exam_session import (
    AlreadyAnswered,
    DailyCapReached,
    _attempts_today,
    _highest_fully_passed_code_excluding,
    _passed_exam_types,
    abandon_session,
    get_or_create_session,
    record_answer,
)
from app.lesson_order import all_lesson_codes_in_order, entry_gate_code, exam_type_for, level_score
from app.oral_exam import QUESTIONS as ORAL_QUESTIONS
from app.oral_exam import build_oral_exam
from app.text_questions import questions_for_text
from app import readiness, wallet

router = APIRouter(prefix="/api", tags=["examens"])


def _current_level(conn, user_id: int) -> str:
    row = conn.execute(
        "SELECT level FROM user_level WHERE user_id = ?", (user_id,)
    ).fetchone()
    return row["level"]


@router.get("/examens/summary")
def get_examens_summary(user_id: int = Depends(get_current_user_id)):
    conn = get_connection()
    try:
        current_level = _current_level(conn, user_id)
        rows = conn.execute(
            "SELECT lesson_code, exam_type FROM exam_progress WHERE user_id = ?",
            (user_id,),
        ).fetchall()
    finally:
        conn.close()

    passed_by_code: dict[str, set] = {}
    for row in rows:
        passed_by_code.setdefault(row["lesson_code"], set()).add(row["exam_type"])

    summary = {}
    for code in all_lesson_codes_in_order():
        passed = passed_by_code.get(code, set())
        summary[code] = {
            "exam_type": exam_type_for(code),
            "ecrit_passed": "ecrit" in passed,
            "oral_passed": "oral" in passed,
            # Même valeur pour tous les codes d'un même chapitre — laisse le
            # frontend retrouver, pour n'importe quelle leçon de ce chapitre,
            # la dernière leçon du chapitre précédent à réussir avant de
            # pouvoir y sauter (cf. app.lesson_order.entry_gate_code).
            "entry_gate": entry_gate_code(code),
        }
    return {"current_level": current_level, "exams": summary}


@router.get("/examens/progression")
def get_examen_progression(user_id: int = Depends(get_current_user_id)):
    conn = get_connection()
    try:
        history_rows = conn.execute(
            """
            SELECT level, reached_at FROM level_history
            WHERE user_id = ? ORDER BY reached_at ASC
            """,
            (user_id,),
        ).fetchall()
        failure_rows = conn.execute(
            """
            SELECT lesson_code, exam_type, attempted_at FROM exam_attempts
            WHERE user_id = ? AND passed = 0 ORDER BY attempted_at ASC
            """,
            (user_id,),
        ).fetchall()
    finally:
        conn.close()

    points = [
        {"date": row["reached_at"], "score": level_score(row["level"])}
        for row in history_rows
        if level_score(row["level"]) is not None
    ]

    failures = []
    for row in failure_rows:
        score_at_time = 0
        for point, history_row in zip(points, history_rows):
            if history_row["reached_at"] <= row["attempted_at"]:
                score_at_time = point["score"]
        failures.append(
            {
                "date": row["attempted_at"],
                "score": score_at_time,
                "exam_type": row["exam_type"],
            }
        )

    return {"points": points, "failures": failures}


@router.get("/examens/copies")
def list_examen_copies(user_id: int = Depends(get_current_user_id)):
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT id, lesson_code, exam_type, average_note, score_ratio, attempted_at
            FROM exam_attempts
            WHERE user_id = ? AND questions_json IS NOT NULL
            ORDER BY attempted_at DESC
            """,
            (user_id,),
        ).fetchall()
    finally:
        conn.close()

    return [
        {
            "id": row["id"],
            "date": row["attempted_at"],
            "code": row["lesson_code"],
            "format": row["exam_type"],
            "exam_type": exam_type_for(row["lesson_code"]),
            "average_note": row["average_note"],
            "success_ratio": row["score_ratio"],
        }
        for row in rows
    ]


@router.get("/examens/copies/{attempt_id}")
def get_examen_copie(attempt_id: int, user_id: int = Depends(get_current_user_id)):
    conn = get_connection()
    try:
        row = conn.execute(
            """
            SELECT id, lesson_code, exam_type, average_note, score_ratio, attempted_at,
                   questions_json, answers_json
            FROM exam_attempts
            WHERE user_id = ? AND id = ? AND questions_json IS NOT NULL
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
        "code": row["lesson_code"],
        "format": row["exam_type"],
        "exam_type": exam_type_for(row["lesson_code"]),
        "average_note": row["average_note"],
        "success_ratio": row["score_ratio"],
        "questions": json.loads(row["questions_json"]),
        "answers": json.loads(row["answers_json"]),
    }


@router.get("/examens/active-lockdown")
def get_active_lockdown(user_id: int = Depends(get_current_user_id)):
    """Tentative en cours (tous formats — rapide/long/très long/hard)
    verrouillant la navigation ailleurs dans l'app — cf. Layout.jsx.
    Enregistrée avant `/examens/{code}` pour ne pas être interceptée comme
    un `code`."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT lesson_code, exam_type FROM exam_sessions WHERE user_id = ? LIMIT 1",
            (user_id,),
        ).fetchone()
        hard_row = None
        if row is None:
            hard_row = conn.execute(
                "SELECT 1 FROM hard_exam_sessions WHERE user_id = ?", (user_id,)
            ).fetchone()
    finally:
        conn.close()

    if row is not None:
        return {"code": row["lesson_code"], "format": row["exam_type"]}
    if hard_row is not None:
        return {"code": "hard", "format": "hard"}
    return None


@router.get("/examens/readiness")
def get_readiness(user_id: int = Depends(get_current_user_id)):
    """Indice de préparation à l'examen suivant — indicateur "Réviser" de
    l'accueil. Enregistrée avant `/examens/{code}` pour ne pas être
    interceptée comme un `code` (même piège que active-lockdown ci-dessus)."""
    return readiness.compute_readiness(user_id)


@router.get("/examens/{code}")
def get_examen(code: str, god_mode: bool = False, user_id: int = Depends(get_current_user_id)):
    conn = get_connection()
    try:
        # `code` est lui-même la leçon de référence pour le tirage : que ce
        # soit "passer l'examen suivant" (code == niveau + 1) ou "sauter une
        # classe" (code arbitraire), il représente la leçon la plus avancée
        # débloquée pour cette tentative — cf. app.lesson_order.reference_lesson.
        try:
            questions, answers, created_at, paused_seconds = get_or_create_session(
                conn, user_id, code, "ecrit", code, build_exam, god_mode
            )
        except DailyCapReached:
            raise HTTPException(429, "Plus de tentative disponible aujourd'hui pour ce format")
    finally:
        conn.close()
    if questions is None:
        raise HTTPException(404, "Leçon introuvable pour cet examen")
    exam_type = exam_type_for(code)
    return {
        "code": code,
        "exam_type": exam_type,
        "pass_threshold": 0.7,
        "total_questions": len(questions),
        "questions": questions,
        "answers": answers,
        "created_at": created_at,
        "paused_seconds": paused_seconds,
        "timer_seconds": TIMER_SECONDS.get(exam_type),
    }


@router.get("/examens/{code}/oral")
def get_examen_oral(code: str, god_mode: bool = False, user_id: int = Depends(get_current_user_id)):
    conn = get_connection()
    try:
        try:
            questions, answers, _created_at, _paused_seconds = get_or_create_session(
                conn, user_id, code, "oral", code, build_oral_exam, god_mode
            )
        except DailyCapReached:
            raise HTTPException(429, "Plus de tentative disponible aujourd'hui pour ce format")
    finally:
        conn.close()
    if questions is None:
        raise HTTPException(404, "Leçon introuvable pour cet examen")
    return {
        "code": code,
        "exam_type": exam_type_for(code),
        "pass_threshold": 0.7,
        "rating_threshold": 4,
        "total_questions": len(questions),
        "questions": questions,
        "answers": answers,
    }


def _coverage_counts(code: str) -> dict:
    """Nombre de mots/verbes/phrases/questions orales couverts par la leçon
    `code` et toutes les leçons antérieures — même pool cumulatif
    ("global_words"/"global_verbs"/"global_phrases"/"global_texts") que
    celui utilisé pour le tirage des examens (`code` sert directement de
    leçon de référence, cf. `get_examen`/`get_examen_oral`).
    `global_phrases`/`global_texts` listent des lesson_code (pas des
    phrases/questions directement), d'où la somme sur les datasets phrase
    et text."""
    lessons = get_dataset("lesson")
    lesson = lessons.get(code)
    if lesson is None:
        return {
            "words_count": 0,
            "verbs_count": 0,
            "phrases_count": 0,
            "oral_questions_count": 0,
            "texts_count": 0,
        }

    phrases_data = get_dataset("phrase")
    phrases_count = sum(len(phrases_data.get(lc, [])) for lc in lesson.get("global_phrases", []))

    texts_data = get_dataset("text")
    global_texts = lesson.get("global_texts", [])
    oral_questions_count = sum(len(questions_for_text(texts_data, tc)) for tc in global_texts)

    return {
        "words_count": len(lesson.get("global_words", [])),
        "verbs_count": len(lesson.get("global_verbs", [])),
        "phrases_count": phrases_count,
        "oral_questions_count": oral_questions_count,
        "texts_count": len(global_texts),
    }


@router.get("/examens/{code}/session-exists")
def get_session_exists(code: str, user_id: int = Depends(get_current_user_id)):
    """Indique si une tentative est déjà en cours pour ce code, par format —
    permet au frontend de distinguer "reprendre une tentative existante"
    (chargement direct) de "en démarrer une nouvelle" (doit passer par une
    confirmation explicite, cf. ExamenEcritScreen/ExamenOralScreen), pour
    éviter qu'une navigation accidentelle (ex: bouton précédent) ne
    déclenche le tirage d'une tentative sans intention du user."""
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT exam_type FROM exam_sessions WHERE user_id = ? AND lesson_code = ?",
            (user_id, code),
        ).fetchall()
    finally:
        conn.close()
    types = {row["exam_type"] for row in rows}
    return {"ecrit": "ecrit" in types, "oral": "oral" in types}


@router.get("/examens/{code}/status")
def get_examen_status(code: str, user_id: int = Depends(get_current_user_id)):
    exam_type = exam_type_for(code)
    conn = get_connection()
    try:
        passed_types = _passed_exam_types(conn, user_id, code)
        last_passed_ecrit = _last_passed_metrics(conn, user_id, code, "ecrit")
        last_passed_oral = _last_passed_metrics(conn, user_id, code, "oral")
        gate = entry_gate_code(code)
        gate_passed = gate is None or {"ecrit", "oral"} <= _passed_exam_types(conn, user_id, gate)
        status = {
            "ecrit_passed": "ecrit" in passed_types,
            "oral_passed": "oral" in passed_types,
            "entry_gate": gate,
            "entry_gate_passed": gate_passed,
            "attempts_today_ecrit": _attempts_today(conn, user_id, code, "ecrit"),
            "attempts_today_oral": _attempts_today(conn, user_id, code, "oral"),
            "last_score_ecrit": _last_score(conn, user_id, code, "ecrit"),
            "last_score_oral": _last_score(conn, user_id, code, "oral"),
            "exam_ecrit_questions": ECRIT_QUESTIONS[exam_type],
            "exam_oral_questions": ORAL_QUESTIONS[exam_type],
            "exam_timer_minutes": TIMER_SECONDS[exam_type] // 60 if exam_type in TIMER_SECONDS else None,
            "last_passed_average_note_ecrit": last_passed_ecrit["average_note"] if last_passed_ecrit else None,
            "last_passed_success_ratio_ecrit": last_passed_ecrit["success_ratio"] if last_passed_ecrit else None,
            "last_passed_average_note_oral": last_passed_oral["average_note"] if last_passed_oral else None,
            "last_passed_success_ratio_oral": last_passed_oral["success_ratio"] if last_passed_oral else None,
            "full_history_ecrit": _full_history(conn, user_id, code, "ecrit"),
            "full_history_oral": _full_history(conn, user_id, code, "oral"),
            "fallback_level": _highest_fully_passed_code_excluding(conn, user_id, code),
            "points_a_gagner_ecrit": wallet.points_a_gagner(conn, user_id, code, "ecrit"),
            "points_a_gagner_oral": wallet.points_a_gagner(conn, user_id, code, "oral"),
            **wallet.recompense_info(conn, user_id, code),
            **_coverage_counts(code),
        }
    finally:
        conn.close()
    return status


def _last_score(conn, user_id: int, code: str, exam_type: str):
    row = conn.execute(
        """
        SELECT score_ratio FROM exam_attempts
        WHERE user_id = ? AND lesson_code = ? AND exam_type = ?
        ORDER BY attempted_at DESC LIMIT 1
        """,
        (user_id, code, exam_type),
    ).fetchone()
    return row["score_ratio"] if row else None


def _last_passed_metrics(conn, user_id: int, code: str, exam_type: str):
    """Note moyenne + taux de réussite de la dernière tentative RÉUSSIE pour
    (code, exam_type) — distinct de `_last_score` qui prend la toute
    dernière tentative quelle que soit son issue. None si jamais réussi."""
    row = conn.execute(
        """
        SELECT average_note, score_ratio FROM exam_attempts
        WHERE user_id = ? AND lesson_code = ? AND exam_type = ? AND passed = 1
        ORDER BY attempted_at DESC LIMIT 1
        """,
        (user_id, code, exam_type),
    ).fetchone()
    if row is None:
        return None
    return {"average_note": row["average_note"], "success_ratio": row["score_ratio"]}


def _full_history(conn, user_id: int, code: str, exam_type: str, limit: int = 5) -> list:
    """Résultat (bool) des `limit` dernières tentatives pour (code,
    exam_type), du plus ancien au plus récent — sans remplissage,
    contrairement à `_attempt_history` (capée à 3 et complétée de None)
    utilisé sur l'écran de résultat."""
    rows = conn.execute(
        """
        SELECT passed FROM exam_attempts
        WHERE user_id = ? AND lesson_code = ? AND exam_type = ?
        ORDER BY attempted_at DESC LIMIT ?
        """,
        (user_id, code, exam_type, limit),
    ).fetchall()
    return [bool(row["passed"]) for row in reversed(rows)]


class ExamAnswerRequest(BaseModel):
    exam_type: str  # "ecrit" | "oral"
    question_index: int
    answer: dict
    pause_seconds: float = 0.0


@router.post("/examens/{code}/answer")
def answer_examen(code: str, payload: ExamAnswerRequest, user_id: int = Depends(get_current_user_id)):
    if payload.exam_type not in ("ecrit", "oral"):
        raise HTTPException(400, "exam_type invalide")

    conn = get_connection()
    try:
        try:
            result = record_answer(
                conn, user_id, code, payload.exam_type, payload.question_index, payload.answer, payload.pause_seconds
            )
        except AlreadyAnswered:
            raise HTTPException(409, "Cette question a déjà été notée")
        except ValueError:
            raise HTTPException(400, "question_index invalide")
    finally:
        conn.close()

    if result is None:
        raise HTTPException(404, "Aucune tentative en cours pour cette leçon/ce format")
    return result


class ExamAbandonRequest(BaseModel):
    exam_type: str  # "ecrit" | "oral"


@router.post("/examens/{code}/abandon")
def abandon_examen(code: str, payload: ExamAbandonRequest, user_id: int = Depends(get_current_user_id)):
    if payload.exam_type not in ("ecrit", "oral"):
        raise HTTPException(400, "exam_type invalide")

    conn = get_connection()
    try:
        result = abandon_session(conn, user_id, code, payload.exam_type)
    finally:
        conn.close()

    if result is None:
        raise HTTPException(404, "Aucune tentative en cours pour cette leçon/ce format")
    return result
