import json

from app.database import DEFAULT_LEVEL, set_user_level
from app.exam import PASS_THRESHOLD
from app.lesson_order import all_lesson_codes_in_order
from app.notifications import create_notification
from app import wallet

MAX_ATTEMPTS_PER_DAY = 3


class DailyCapReached(Exception):
    pass


class AlreadyAnswered(Exception):
    pass


def _note_and_success(exam_type: str, question_type: str, answer: dict) -> tuple:
    """Note sur 5 et réussite (≥4) pour une réponse donnée, mêmes règles
    que l'affichage frontend existant (GEMINI_SUCCESS_THRESHOLD pour
    l'écrit, les 3 notes Gemini ≥4 pour l'oral standard, pour un rapport la
    moyenne pondérée de Résumé (poids 2) et Détails (poids 1), ≥4)."""
    if exam_type == "ecrit":
        note = answer["score"]
        return note, note >= 4
    if question_type == "rapport":
        note = (2 * answer["score_summary"] + answer["score_details"]) / 3
        return note, note >= 4
    ratings = [answer["rating_completeness"], answer["rating_hebrew"], answer["rating_comprehension"]]
    note = sum(ratings) / len(ratings)
    return note, all(r >= 4 for r in ratings)


def _attempts_today(conn, user_id: int, code: str, exam_type: str) -> int:
    row = conn.execute(
        """
        SELECT COUNT(*) AS n FROM exam_attempts
        WHERE user_id = ? AND lesson_code = ? AND exam_type = ?
        AND date(attempted_at) = date('now')
        """,
        (user_id, code, exam_type),
    ).fetchone()
    return row["n"]


def _passed_exam_types(conn, user_id: int, code: str) -> set:
    rows = conn.execute(
        "SELECT exam_type FROM exam_progress WHERE user_id = ? AND lesson_code = ?",
        (user_id, code),
    ).fetchall()
    return {row["exam_type"] for row in rows}


def _attempt_history(conn, user_id: int, code: str, exam_type: str, limit: int = 3) -> list:
    """{id, passed} des `limit` dernières tentatives pour (code, exam_type),
    du plus ancien au plus récent — complété à gauche par des entrées
    {id: None, passed: None} (tentative pas encore faite) s'il y en a moins
    que `limit`. `id` permet au frontend de lier chaque pastille à sa copie
    (cf. /examen/copies/{id})."""
    rows = conn.execute(
        """
        SELECT id, passed FROM exam_attempts
        WHERE user_id = ? AND lesson_code = ? AND exam_type = ?
        ORDER BY attempted_at DESC LIMIT ?
        """,
        (user_id, code, exam_type, limit),
    ).fetchall()
    recent = [{"id": row["id"], "passed": bool(row["passed"])} for row in reversed(rows)]
    return [{"id": None, "passed": None}] * (limit - len(recent)) + recent


def _highest_fully_passed_code_excluding(conn, user_id: int, exclude_code: str) -> str:
    """Code le plus haut (hors `exclude_code`) encore pleinement validé
    (écrit ET oral dans exam_progress) — niveau de repli après une repasse
    ratée. `DEFAULT_LEVEL` si aucun (cas extrême : on rate la repasse du
    tout premier examen jamais réussi)."""
    for c in reversed(all_lesson_codes_in_order()):
        if c == exclude_code:
            continue
        if {"ecrit", "oral"} <= _passed_exam_types(conn, user_id, c):
            return c
    return DEFAULT_LEVEL


def get_or_create_session(
    conn, user_id: int, code: str, exam_type: str, current_level: str, build_fn, god_mode: bool = False
):
    """Renvoie (questions, answers, created_at, paused_seconds) de la
    tentative en cours pour (code, exam_type), en la créant si besoin.
    `created_at`/`paused_seconds` servent de base au minuteur des examens
    écrits long/très long (temps écoulé = maintenant - created_at -
    paused_seconds déjà accumulées). `build_fn` est `build_exam`/
    `build_oral_exam` : n'est appelé que pour tirer une toute nouvelle
    tentative, jamais pour une déjà commencée. Lève `DailyCapReached` si
    le plafond quotidien est atteint et qu'aucune tentative n'est en
    cours (sauf `god_mode`, qui ignore ce plafond — bascule client
    purement cosmétique ailleurs dans l'app, ici la seule vérification qui
    compte réellement). Renvoie (None, None, None, None) si `code` est
    inconnu."""
    row = conn.execute(
        """
        SELECT questions_json, answers_json, created_at, paused_seconds FROM exam_sessions
        WHERE user_id = ? AND lesson_code = ? AND exam_type = ?
        """,
        (user_id, code, exam_type),
    ).fetchone()
    if row is not None:
        return (
            json.loads(row["questions_json"]),
            json.loads(row["answers_json"]),
            row["created_at"],
            row["paused_seconds"],
        )

    if not god_mode and _attempts_today(conn, user_id, code, exam_type) >= MAX_ATTEMPTS_PER_DAY:
        raise DailyCapReached()

    exam = build_fn(code, current_level)
    if exam is None:
        return None, None, None, None

    questions = exam["questions"]
    answers = [None] * len(questions)
    conn.execute(
        """
        INSERT INTO exam_sessions (user_id, lesson_code, exam_type, questions_json, answers_json)
        VALUES (?, ?, ?, ?, ?)
        """,
        (user_id, code, exam_type, json.dumps(questions), json.dumps(answers)),
    )
    conn.commit()
    row = conn.execute(
        """
        SELECT created_at, paused_seconds FROM exam_sessions
        WHERE user_id = ? AND lesson_code = ? AND exam_type = ?
        """,
        (user_id, code, exam_type),
    ).fetchone()
    return questions, answers, row["created_at"], row["paused_seconds"]


def record_answer(
    conn, user_id: int, code: str, exam_type: str, question_index: int, answer: dict, pause_seconds: float = 0.0
):
    """Enregistre la réponse à une question de la tentative en cours pour
    (code, exam_type). Lève `AlreadyAnswered` si cet index a déjà une
    réponse, `ValueError` si l'index est hors limites, renvoie None si
    aucune tentative n'est en cours pour (code, exam_type). `pause_seconds`
    (mesuré côté client) est le temps passé à attendre la réponse Gemini
    pour cette question — accumulé dans `exam_sessions.paused_seconds` pour
    que le minuteur reste correct après une reprise (reload).

    Si toutes les réponses sont désormais présentes, finalise la
    tentative (log dans exam_attempts, montée de niveau éventuelle,
    suppression de la tentative en cours) et renvoie le récapitulatif.
    Sinon renvoie simplement {"completed": False}."""
    row = conn.execute(
        """
        SELECT questions_json, answers_json FROM exam_sessions
        WHERE user_id = ? AND lesson_code = ? AND exam_type = ?
        """,
        (user_id, code, exam_type),
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
        # Une question quizz n'est jamais notée par Gemini : on valide
        # nous-mêmes server-side (comparaison à la clé correcte figée dans
        # la question), plutôt que de faire confiance à ce que le client
        # prétend avoir sélectionné. "score" 5/1 reste compatible avec
        # _note_and_success, qui ne fait aucune distinction entre les types
        # de question écrite.
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
            """
            UPDATE exam_sessions SET answers_json = ?, paused_seconds = paused_seconds + ?
            WHERE user_id = ? AND lesson_code = ? AND exam_type = ?
            """,
            (json.dumps(answers), pause_seconds, user_id, code, exam_type),
        )
        conn.commit()
        return {"completed": False}

    return _finalize(conn, user_id, code, exam_type, questions, answers)


def _finalize(conn, user_id: int, code: str, exam_type: str, questions: list, answers: list) -> dict:
    """Note/valide une tentative dont toutes les réponses sont désormais
    présentes (complétion normale ou abandon) : log dans exam_attempts,
    montée de niveau éventuelle, suppression de la tentative en cours.
    Partagé par `record_answer` (dernière réponse posée) et
    `abandon_session` (réponses restantes comblées d'un coup).

    Capturé AVANT toute écriture : si ce (code, exam_type) était déjà
    certifié et que cette tentative échoue, c'est une repasse ratée —
    perte de la certification pour ce format + recalcul du niveau."""
    was_already_certified = exam_type in _passed_exam_types(conn, user_id, code)

    notes_successes = [
        _note_and_success(exam_type, q.get("type"), a) for q, a in zip(questions, answers)
    ]
    average_note = sum(n for n, _ in notes_successes) / len(notes_successes)
    success_ratio = sum(1 for _, s in notes_successes if s) / len(notes_successes)
    passed = success_ratio >= PASS_THRESHOLD

    # La copie complète (questions + réponses) est conservée définitivement
    # dans exam_attempts pour l'écran "Mes copies", alors que exam_sessions
    # (la tentative en cours) est supprimée juste après.
    cursor = conn.execute(
        """
        INSERT INTO exam_attempts
            (user_id, lesson_code, exam_type, passed, score_ratio, average_note, questions_json, answers_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            code,
            exam_type,
            int(passed),
            success_ratio,
            average_note,
            json.dumps(questions),
            json.dumps(answers),
        ),
    )
    attempt_id = cursor.lastrowid
    conn.execute(
        "DELETE FROM exam_sessions WHERE user_id = ? AND lesson_code = ? AND exam_type = ?",
        (user_id, code, exam_type),
    )

    if passed:
        conn.execute(
            """
            INSERT INTO exam_progress (user_id, lesson_code, exam_type, passed_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(user_id, lesson_code, exam_type)
            DO UPDATE SET passed_at = excluded.passed_at
            """,
            (user_id, code, exam_type),
        )
    elif was_already_certified:
        # Repasse ratée d'un format déjà certifié : perd sa certification.
        conn.execute(
            "DELETE FROM exam_progress WHERE user_id = ? AND lesson_code = ? AND exam_type = ?",
            (user_id, code, exam_type),
        )
    conn.commit()

    niveau_updated = False
    level_downgraded = False
    new_level = None
    current_level_row = conn.execute(
        "SELECT level FROM user_level WHERE user_id = ?", (user_id,)
    ).fetchone()
    current_level = current_level_row["level"] if current_level_row else None

    passed_types = _passed_exam_types(conn, user_id, code)
    if {"ecrit", "oral"} <= passed_types:
        # Crédite les points de la leçon au wallet — une seule fois par
        # leçon (pas une fois par format) : la première fois que ce bloc
        # s'exécute pour ce `code` correspond à la vraie montée de niveau,
        # les fois suivantes à une repasse volontaire (points divisés par
        # deux à chaque fois, cf. app.wallet.enregistrer_examen_reussi).
        wallet.enregistrer_examen_reussi(conn, user_id, code)

        # Repasser (et réussir) un examen déjà validé plus bas que le niveau
        # actuel ne doit jamais faire redescendre le niveau — set_user_level
        # n'est appelé que si `code` fait réellement progresser (plus haut
        # que le niveau courant dans l'ordre du cours), jamais pour une
        # simple reconfirmation d'un examen déjà dépassé.
        codes = all_lesson_codes_in_order()
        # `current_level not in codes` couvre le sentinel de bootstrap
        # (DEFAULT_LEVEL, avant toute progression) : sans ce cas, la toute
        # première réussite d'un user neuf ne serait jamais comptée comme
        # une avancée (le sentinel n'étant par construction jamais dans
        # codes), et son niveau resterait bloqué indéfiniment au bootstrap.
        is_advance = (
            current_level is None
            or current_level not in codes
            or (code in codes and codes.index(code) > codes.index(current_level))
        )
        if is_advance:
            set_user_level(user_id, code)
            niveau_updated = True
    elif was_already_certified and not passed:
        fallback_level = _highest_fully_passed_code_excluding(conn, user_id, code)
        if fallback_level != current_level:
            set_user_level(user_id, fallback_level)
            level_downgraded = True
            new_level = fallback_level
        conn.commit()

    other_type = "oral" if exam_type == "ecrit" else "ecrit"
    other_row = conn.execute(
        """
        SELECT passed, score_ratio, average_note FROM exam_attempts
        WHERE user_id = ? AND lesson_code = ? AND exam_type = ?
        ORDER BY attempted_at DESC LIMIT 1
        """,
        (user_id, code, other_type),
    ).fetchone()
    other = None
    if other_row is not None:
        other = {
            "exam_type": other_type,
            "average_note": other_row["average_note"],
            "success_ratio": other_row["score_ratio"],
            "passed": bool(other_row["passed"]),
        }

    # Notification systématique dès qu'une correction Gemini est prête — le
    # user a pu fermer l'onglet en attendant (cf. record_answer, chaque
    # réponse est déjà persistée au fur et à mesure) et revient la consulter
    # via /notifications plus tard. Le lien pointe vers "Mes copies" pour
    # cette tentative précise. Une seule notification par tentative, même en
    # cas de montée de niveau (le message l'inclut plutôt que d'en émettre
    # une deuxième).
    format_label = "écrit" if exam_type == "ecrit" else "oral"
    message = (
        f"Ta correction est prête : examen {format_label} "
        f"{'réussi' if passed else 'non réussi'} (moyenne {average_note:.1f}/5)."
    )
    if niveau_updated:
        message += " Tu peux maintenant tenter le Hard Exam pour gagner un maximum de points."
    create_notification(conn, user_id, message, link=f"/examen/copies/{attempt_id}")

    return {
        "completed": True,
        "attempt_id": attempt_id,
        "current": {
            "exam_type": exam_type,
            "average_note": average_note,
            "success_ratio": success_ratio,
            "passed": passed,
        },
        "other": other,
        "niveau_updated": niveau_updated,
        "level_downgraded": level_downgraded,
        "new_level": new_level,
        "history": {
            "ecrit": _attempt_history(conn, user_id, code, "ecrit"),
            "oral": _attempt_history(conn, user_id, code, "oral"),
        },
        "attempts_remaining_ecrit": max(0, MAX_ATTEMPTS_PER_DAY - _attempts_today(conn, user_id, code, "ecrit")),
        "attempts_remaining_oral": max(0, MAX_ATTEMPTS_PER_DAY - _attempts_today(conn, user_id, code, "oral")),
    }


def _abandoned_answer(exam_type: str, question: dict) -> dict:
    """Réponse synthétique pour une question restée sans réponse suite à un
    abandon d'épreuve — toujours notée au minimum (1), avec des champs
    d'affichage vides mais présents pour ne pas casser le rendu de 'Mes
    copies' (verbatim/justifications/observations attendus non-null)."""
    question_type = question.get("type")
    if exam_type == "ecrit":
        if question_type == "quizz":
            # Même forme que record_answer pour une vraie réponse quizz
            # (cf. plus haut), juste jamais sélectionnée -> notée 1.
            return {"type": "quizz", "selected_key": None, "correct_key": question.get("key"), "score": 1}
        return {"score": 1, "translation": "", "observations": ["Épreuve abandonnée — question non traitée"]}
    if question_type == "rapport":
        return {
            "score_summary": 1,
            "justification_summary": [],
            "score_details": 1,
            "justification_details": [],
            "rapport": "",
        }
    return {
        "verbatim": "",
        "rating_completeness": 1,
        "errors_rating_completeness": [],
        "rating_hebrew": 1,
        "errors_rating_hebrew": [],
        "rating_comprehension": 1,
        "errors_rating_comprehension": [],
    }


def abandon_session(conn, user_id: int, code: str, exam_type: str) -> dict | None:
    """Comble d'un coup toutes les questions sans réponse d'une tentative en
    cours avec une réponse synthétique notée 1 (cf. `_abandoned_answer`),
    puis finalise exactement comme une complétion normale. Renvoie None si
    aucune tentative n'est en cours pour (code, exam_type)."""
    row = conn.execute(
        """
        SELECT questions_json, answers_json FROM exam_sessions
        WHERE user_id = ? AND lesson_code = ? AND exam_type = ?
        """,
        (user_id, code, exam_type),
    ).fetchone()
    if row is None:
        return None

    questions = json.loads(row["questions_json"])
    answers = json.loads(row["answers_json"])
    for i, (question, answer) in enumerate(zip(questions, answers)):
        if answer is None:
            answers[i] = _abandoned_answer(exam_type, question)

    return _finalize(conn, user_id, code, exam_type, questions, answers)
