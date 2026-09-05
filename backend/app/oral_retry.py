"""Relance d'une évaluation orale groupée après un échec par surcharge
Gemini (429/503, ou timeout de traitement d'un fichier audio) — cf. demande
explicite du user : au lieu de perdre les enregistrements de l'étudiant, on
les persiste (fichiers audio compris) pour permettre une relance ultérieure
en tâche de fond, déclenchée depuis une notification d'action épinglée
(cf. app.action_notifications), sans que l'étudiant n'ait à ré-enregistrer
quoi que ce soit."""

import json

from google.genai.errors import APIError

from app.data_loader import get_dataset
from app.database import get_connection
from app.exam_session import AlreadyAnswered, record_answer
from app.gemini import evaluate_orals_grouped
from app.notifications import create_notification

OVERLOAD_CODES = {429, 503}


def is_overload_error(exc: Exception) -> bool:
    """Vrai pour une surcharge/indisponibilité temporaire de Gemini (à mettre
    en attente de relance) ; faux pour toute autre raison (filtre de
    sécurité, réponse malformée...), à montrer telle quelle au user pour
    qu'il ajuste sa prochaine tentative — cf. demande explicite du user."""
    if isinstance(exc, RuntimeError):
        # Timeout du traitement de fichier (cf. gemini._wait_until_active) —
        # transitoire par nature, traité comme une surcharge.
        return True
    return isinstance(exc, APIError) and exc.code in OVERLOAD_CODES


def persist_batch(user_id: int, exam_code: str, entries_by_id: dict, audio_items: list[dict]) -> int:
    """entries_by_id: {identifiant: {"identifiant","text_code","question_index"}}.
    audio_items: [{"identifiant_question","audio_bytes","mime_type"}] (cf.
    evaluate_orals_grouped). Renvoie l'id du lot créé."""
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO oral_retry_batches (user_id, exam_code, entries_json) VALUES (?, ?, ?)",
            (user_id, exam_code, json.dumps(entries_by_id, ensure_ascii=False)),
        )
        batch_id = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
        for item in audio_items:
            conn.execute(
                "INSERT INTO oral_retry_audios (batch_id, identifiant, mime_type, audio_blob) VALUES (?, ?, ?, ?)",
                (batch_id, item["identifiant_question"], item["mime_type"], item["audio_bytes"]),
            )
        conn.commit()
        return batch_id
    finally:
        conn.close()


def get_batch_owner_and_status(batch_id: int) -> tuple[int, str] | None:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT user_id, status FROM oral_retry_batches WHERE id = ?", (batch_id,)
        ).fetchone()
        return (row["user_id"], row["status"]) if row else None
    finally:
        conn.close()


def mark_running(batch_id: int) -> bool:
    """True si le lot était bien en attente et vient d'être marqué en cours
    (évite qu'un double clic ne lance deux relances en parallèle)."""
    conn = get_connection()
    try:
        row = conn.execute("SELECT status FROM oral_retry_batches WHERE id = ?", (batch_id,)).fetchone()
        if row is None or row["status"] != "pending":
            return False
        conn.execute("UPDATE oral_retry_batches SET status = 'running' WHERE id = ?", (batch_id,))
        conn.commit()
        return True
    finally:
        conn.close()


def _build_grouped(entries_by_id: dict) -> dict:
    """Reconstruit le groupement par texte attendu par evaluate_orals_grouped
    à partir des données actuelles (texts_data) plutôt que d'une copie
    persistée qui pourrait devenir obsolète."""
    texts_data = get_dataset("text")
    grouped_by_text: dict[str, dict] = {}
    for identifiant, entry in entries_by_id.items():
        text_code = entry["text_code"]
        question_index = entry["question_index"]
        text = texts_data[text_code]
        group = grouped_by_text.setdefault(
            text_code, {"identifiant_texte": text_code, "texte": text["text"], "questions": []}
        )
        group["questions"].append(
            {"identifiant_question": identifiant, "question_hebrew": text["questions"][question_index]["hebrew"]}
        )
    return grouped_by_text


def _failure_reason(exc: Exception) -> str:
    if isinstance(exc, APIError) and exc.code in OVERLOAD_CODES:
        return "le système de correction est de nouveau surchargé, réessaie plus tard"
    if isinstance(exc, APIError):
        return exc.message or str(exc)
    if isinstance(exc, RuntimeError):
        return str(exc)
    return "erreur inattendue, contacte le support si ça persiste"


def run_retry_batch(batch_id: int, user_id: int) -> None:
    """Tâche de fond (FastAPI BackgroundTasks) : relance l'appel Gemini pour
    le lot, persiste les réponses en cas de succès (réutilise
    exam_session.record_answer, qui gère déjà la montée de niveau et la
    notification "ta correction est prête"), notifie systématiquement le
    user du succès ou de l'échec de CETTE relance — cf. demande explicite du
    user."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT exam_code, entries_json FROM oral_retry_batches WHERE id = ? AND user_id = ?",
            (batch_id, user_id),
        ).fetchone()
        if row is None:
            return
        exam_code = row["exam_code"]
        entries_by_id = json.loads(row["entries_json"])

        audio_rows = conn.execute(
            "SELECT identifiant, mime_type, audio_blob FROM oral_retry_audios WHERE batch_id = ?",
            (batch_id,),
        ).fetchall()
        audio_items = [
            {
                "identifiant_texte": entries_by_id[r["identifiant"]]["text_code"],
                "identifiant_question": r["identifiant"],
                "audio_bytes": r["audio_blob"],
                "mime_type": r["mime_type"],
            }
            for r in audio_rows
        ]

        try:
            results = evaluate_orals_grouped(list(_build_grouped(entries_by_id).values()), audio_items)
        except Exception as exc:  # noqa: BLE001 — toute cause doit produire une notification, jamais un crash silencieux
            reason = _failure_reason(exc)
            # Repositionné à "pending", jamais abandonné : le user peut
            # relancer autant de fois qu'il veut depuis la même notification
            # d'action, cf. demande explicite du user.
            conn.execute("UPDATE oral_retry_batches SET status = 'pending' WHERE id = ?", (batch_id,))
            conn.commit()
            create_notification(conn, user_id, f"La relance de ta correction orale a échoué : {reason}")
            return

        by_identifiant = {r["identifiant_question"]: r for r in results}
        for identifiant, entry in entries_by_id.items():
            result = by_identifiant.get(identifiant)
            if result is None:
                continue
            aggregate_score = round(
                (result["rating_completeness"] + result["rating_hebrew"] + result["rating_comprehension"]) / 3
            )
            object_key = f"{entry['text_code']}|{entry['question_index']}"
            conn.execute(
                "INSERT INTO evaluations (user_id, object_type, object_key, success, score) VALUES (?, 'oral', ?, NULL, ?)",
                (user_id, object_key, aggregate_score),
            )
            try:
                record_answer(conn, user_id, exam_code, "oral", int(identifiant), result)
            except AlreadyAnswered:
                continue
        conn.commit()

        conn.execute("DELETE FROM oral_retry_audios WHERE batch_id = ?", (batch_id,))
        conn.execute("DELETE FROM oral_retry_batches WHERE id = ?", (batch_id,))
        conn.commit()

        create_notification(conn, user_id, "Ta relance a réussi : ta correction orale a bien été transmise.")
        # La notification "Ta correction est prête" (+ montée de niveau
        # éventuelle) est déjà créée par record_answer/_finalize ci-dessus
        # dès que toutes les réponses de l'examen sont présentes — pas besoin
        # de la dupliquer ici, cf. demande explicite du user (notification
        # de niveau distincte, déjà couverte par ce mécanisme existant).
    finally:
        conn.close()
