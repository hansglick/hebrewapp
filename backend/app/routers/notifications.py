from fastapi import APIRouter, Depends

from app.auth import get_current_user_id
from app.database import get_connection
from app.notifications import MAX_NOTIFICATIONS

router = APIRouter(prefix="/api", tags=["notifications"])


@router.get("/notifications/unread-count")
def get_unread_count(user_id: int = Depends(get_current_user_id)):
    """Sans effet de bord — utilisé par le badge du header, qui ne doit pas
    marquer les notifications comme lues juste en les comptant."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0",
            (user_id,),
        ).fetchone()
    finally:
        conn.close()
    return {"count": row["n"]}


@router.get("/notifications")
def list_notifications(user_id: int = Depends(get_current_user_id)):
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
            (user_id, MAX_NOTIFICATIONS),
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
        conn.execute("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0", (user_id,))
        conn.commit()
    finally:
        conn.close()
    return result
