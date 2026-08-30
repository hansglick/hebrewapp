import json

from app.hard_exam import PASS_THRESHOLD, _note_and_success, build_hard_exam, is_unlocked
from app import wallet


class NotUnlocked(Exception):
    pass


class AlreadyAnswered(Exception):
    pass


def get_or_create_session(conn, user_id: int, current_level: str):
    """Renvoie (questions, answers, created_at, paused_seconds) de la
    tentative de hard exam en cours, en la créant si besoin. Une tentative
    déjà en cours peut toujours être reprise même si `is_unlocked` est
    devenu faux entre-temps (il ne peut de toute façon pas le devenir tant
    qu'aucune ligne n'est ajoutée à hard_exam_attempts, cf. _finalize) —
    seule la création d'une TOUTE NOUVELLE tentative exige le
    déverrouillage. Lève `NotUnlocked` sinon."""
    row = conn.execute(
        "SELECT questions_json, answers_json, created_at, paused_seconds FROM hard_exam_sessions WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    if row is not None:
        return (
            json.loads(row["questions_json"]),
            json.loads(row["answers_json"]),
            row["created_at"],
            row["paused_seconds"],
        )

    if not is_unlocked(conn, user_id):
        raise NotUnlocked()

    exam = build_hard_exam(conn, user_id, current_level)
    questions = exam["questions"]
    answers = [None] * len(questions)
    conn.execute(
        "INSERT INTO hard_exam_sessions (user_id, questions_json, answers_json) VALUES (?, ?, ?)",
        (user_id, json.dumps(questions), json.dumps(answers)),
    )
    conn.commit()
    row = conn.execute(
        "SELECT created_at, paused_seconds FROM hard_exam_sessions WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    return questions, answers, row["created_at"], row["paused_seconds"]


def record_answer(conn, user_id: int, question_index: int, answer: dict, pause_seconds: float = 0.0):
    """Même logique que app.exam_session.record_answer, sans lesson_code ni
    exam_type (un seul hard exam global par user)."""
    row = conn.execute(
        "SELECT questions_json, answers_json FROM hard_exam_sessions WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    if row is None:
        return None

    questions = json.loads(row["questions_json"])
    answers = json.loads(row["answers_json"])
    if question_index < 0 or question_index >= len(answers):
        raise ValueError("question_index invalide")
    if answers[question_index] is not None:
        raise AlreadyAnswered()

    question = questions[question_index]
    if question.get("type") == "quizz":
        # Validée serveur, jamais côté client (cf. app.exam_session).
        selected_key = answer.get("selected_key")
        correct_key = question["key"]
        answer = {
            "type": "quizz",
            "selected_key": selected_key,
            "correct_key": correct_key,
            "score": 5 if selected_key == correct_key else 1,
        }

    answers[question_index] = answer

    if any(a is None for a in answers):
        conn.execute(
            "UPDATE hard_exam_sessions SET answers_json = ?, paused_seconds = paused_seconds + ? WHERE user_id = ?",
            (json.dumps(answers), pause_seconds, user_id),
        )
        conn.commit()
        return {"completed": False}

    return _finalize(conn, user_id, questions, answers)


def _finalize(conn, user_id: int, questions: list, answers: list) -> dict:
    """Note la tentative complète, l'archive dans hard_exam_attempts et
    supprime la session en cours. Ne touche jamais user_level/
    exam_progress/evaluations : le hard exam est un défi à part, sans
    impact sur la progression normale."""
    notes_successes = [_note_and_success(q, a) for q, a in zip(questions, answers)]
    average_note = sum(n for n, _ in notes_successes) / len(notes_successes)
    success_ratio = sum(1 for _, s in notes_successes if s) / len(notes_successes)
    passed = success_ratio >= PASS_THRESHOLD

    cursor = conn.execute(
        """
        INSERT INTO hard_exam_attempts
            (user_id, passed, score_ratio, average_note, questions_json, answers_json)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (user_id, int(passed), success_ratio, average_note, json.dumps(questions), json.dumps(answers)),
    )
    attempt_id = cursor.lastrowid
    conn.execute("DELETE FROM hard_exam_sessions WHERE user_id = ?", (user_id,))
    conn.commit()

    if passed:
        wallet.enregistrer_hard_exam_reussi(conn, user_id)

    return {
        "completed": True,
        "attempt_id": attempt_id,
        "passed": passed,
        "average_note": average_note,
        "success_ratio": success_ratio,
        "pass_threshold": PASS_THRESHOLD,
    }


def _abandoned_answer(question: dict) -> dict:
    qtype = question.get("type")
    if qtype == "verbe":
        return {"submitted": ""}
    if qtype == "quizz":
        return {"type": "quizz", "selected_key": None, "correct_key": question.get("key"), "score": 1}
    if qtype == "traduction":
        return {"score": 1, "translation": "", "observations": ["Épreuve abandonnée — question non traitée"]}
    return {
        "verbatim": "",
        "rating_completeness": 1,
        "errors_rating_completeness": [],
        "rating_hebrew": 1,
        "errors_rating_hebrew": [],
        "rating_comprehension": 1,
        "errors_rating_comprehension": [],
    }


def abandon_session(conn, user_id: int) -> dict | None:
    row = conn.execute(
        "SELECT questions_json, answers_json FROM hard_exam_sessions WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    if row is None:
        return None

    questions = json.loads(row["questions_json"])
    answers = json.loads(row["answers_json"])
    for i, (question, answer) in enumerate(zip(questions, answers)):
        if answer is None:
            answers[i] = _abandoned_answer(question)

    return _finalize(conn, user_id, questions, answers)
