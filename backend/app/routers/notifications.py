from fastapi import APIRouter

from app.database import DEFAULT_USER_ID, get_connection
from app.notifications import MAX_NOTIFICATIONS

router = APIRouter(prefix="/api", tags=["notifications"])


@router.get("/notifications/unread-count")
def get_unread_count():
    """Sans effet de bord — utilisé par le badge du header, qui ne doit pas
    marquer les notifications comme lues juste en les comptant."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0",
            (DEFAULT_USER_ID,),
        ).fetchone()
    finally:
        conn.close()
    return {"count": row["n"]}


@router.get("/notifications")
def list_notifications():
    """Les MAX_NOTIFICATIONS dernières, du plus récent au plus ancien. Le
    champ `read` de la réponse reflète l'état AVANT la mise à jour ci-dessous
    (calculé d'abord) — sinon tout apparaîtrait déjà lu dès ce premier appel,
    empêchant l'écran d'afficher en gras ce qui vient d'être consulté."""
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT id, message, link, is_read, created_at FROM notifications
            WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?
            """,
            (DEFAULT_USER_ID, MAX_NOTIFICATIONS),
        ).fetchall()
        result = [
            {
                "id": row["id"],
                "message": row["message"],
                "link": row["link"],
                "read": bool(row["is_read"]),
                "created_at": row["created_at"],
            }
            for row in rows
        ]
        conn.execute("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0", (DEFAULT_USER_ID,))
        conn.commit()
    finally:
        conn.close()
    return result
