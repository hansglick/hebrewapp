"""Notifications d'action : "Hard Exam disponible", "reprendre un examen en
cours" — jamais persistées en base, toujours recalculées à la volée à
partir de l'état réel (cf. routers/notifications.py). Ce choix évite toute
dérive entre une ligne de notification stockée et la réalité (session
toujours en cours ? Hard Exam encore déverrouillé ?) : il suffit de relire
l'état existant, déjà maintenu ailleurs pour d'autres besoins."""

from app.hard_exam import is_unlocked
from app.wallet import HARD_EXAM_BONUS_POINTS

FORMAT_LABELS = {"ecrit": "écrit", "oral": "oral"}


def _last_completed_attempt_at(conn, user_id: int) -> str | None:
    """Horodatage de la toute dernière tentative d'examen terminée
    (classique OU Hard Exam), tous types confondus — sert à décider si une
    session encore en cours est "périmée" (le user est passé à autre chose
    depuis, cf. demande explicite du user : une reprise se périme dès que
    le user termine N'IMPORTE QUEL autre examen)."""
    row = conn.execute(
        """
        SELECT MAX(t) AS t FROM (
            SELECT MAX(attempted_at) AS t FROM exam_attempts WHERE user_id = ?
            UNION ALL
            SELECT MAX(attempted_at) AS t FROM hard_exam_attempts WHERE user_id = ?
        )
        """,
        (user_id, user_id),
    ).fetchone()
    return row["t"] if row else None


def get_action_notifications(conn, user_id: int) -> list[dict]:
    notifications = []

    if is_unlocked(conn, user_id):
        notifications.append(
            {
                "id": "action:hard_exam",
                "message": (
                    f"Le Hard Exam est disponible et rapporte {HARD_EXAM_BONUS_POINTS} points bonus ! "
                    "Il n'est accessible que jusqu'à ta prochaine réussite d'un examen classique, "
                    "après quoi il ne sera plus jamais accessible pour cette leçon."
                ),
                "link": "/examen/hard",
                "pinned": True,
            }
        )

    last_completed = _last_completed_attempt_at(conn, user_id)

    for row in conn.execute(
        "SELECT lesson_code, exam_type, created_at FROM exam_sessions WHERE user_id = ?",
        (user_id,),
    ):
        if last_completed is None or row["created_at"] > last_completed:
            format_label = FORMAT_LABELS[row["exam_type"]]
            notifications.append(
                {
                    "id": f"action:resume:{row['lesson_code']}:{row['exam_type']}",
                    "message": (
                        f"Tu as un examen {format_label} en cours (leçon {row['lesson_code']}) "
                        "— reprends-le là où tu t'étais arrêté."
                    ),
                    "link": f"/examen/{'ecrite' if row['exam_type'] == 'ecrit' else 'orale'}/{row['lesson_code']}",
                    "pinned": True,
                }
            )

    hard_row = conn.execute(
        "SELECT created_at FROM hard_exam_sessions WHERE user_id = ?", (user_id,)
    ).fetchone()
    if hard_row is not None and (last_completed is None or hard_row["created_at"] > last_completed):
        notifications.append(
            {
                "id": "action:resume:hard",
                "message": "Tu as un Hard Exam en cours — reprends-le là où tu t'étais arrêté.",
                "link": "/examen/hard/passer",
                "pinned": True,
            }
        )

    # Lot d'évaluation orale groupée mis en attente après une surcharge
    # Gemini (cf. app.oral_retry) : bouton de relance directement sur la
    # notification (action + action_payload, pas un simple lien de
    # navigation) — cf. demande explicite du user.
    for row in conn.execute(
        "SELECT id FROM oral_retry_batches WHERE user_id = ? AND status = 'pending'", (user_id,)
    ):
        notifications.append(
            {
                "id": f"action:oral_retry:{row['id']}",
                "message": (
                    "Le système de correction était surchargé lors de ta dernière tentative — "
                    "clique pour renvoyer tes réponses orales à l'examinateur."
                ),
                "link": None,
                "pinned": True,
                "action": "retry_oral_grouped",
                "action_payload": {"batch_id": row["id"]},
            }
        )

    return notifications
