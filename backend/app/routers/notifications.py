from fastapi import APIRouter, Depends

from app.action_notifications import get_action_notifications
from app.auth import get_current_user_id
from app.database import get_connection
from app.notifications import MAX_NOTIFICATIONS, prune_expired

router = APIRouter(prefix="/api", tags=["notifications"])


@router.get("/notifications/unread-count")
def get_unread_count(user_id: int = Depends(get_current_user_id)):
    """Sans effet de bord — utilisé par le badge du header, qui ne doit pas
    marquer les notifications comme lues juste en les comptant. Compte les
    notifications d'action (toujours "non lues" tant qu'elles existent,
    jamais persistées, cf. app.action_notifications) + les informatives
    non lues."""
    conn = get_connection()
    try:
        prune_expired(conn, user_id)
        action_count = len(get_action_notifications(conn, user_id))
        row = conn.execute(
            "SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0",
            (user_id,),
        ).fetchone()
    finally:
        conn.close()
    return {"count": action_count + row["n"]}


@router.get("/notifications")
def list_notifications(user_id: int = Depends(get_current_user_id)):
    """Notifications d'action (toujours en tête, épinglées, jamais
    persistées) suivies des MAX_NOTIFICATIONS informatives les plus
    récentes. Le champ `read` de la réponse reflète l'état AVANT la mise à
    jour ci-dessous (calculé d'abord) — sinon tout apparaîtrait déjà lu dès
    ce premier appel, empêchant l'écran d'afficher en gras ce qui vient
    d'être consulté."""
    conn = get_connection()
    try:
        prune_expired(conn, user_id)
        actions = [
            {
                "id": a["id"],
                "message": a["message"],
                "link": a["link"],
                "read": False,
                "pinned": True,
                "created_at": None,
            }
            for a in get_action_notifications(conn, user_id)
        ]
        rows = conn.execute(
            """
            SELECT id, message, link, is_read, created_at FROM notifications
            WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?
            """,
            (user_id, MAX_NOTIFICATIONS),
        ).fetchall()
        informatives = [
            {
                "id": row["id"],
                "message": row["message"],
                "link": row["link"],
                "read": bool(row["is_read"]),
                "pinned": False,
                "created_at": row["created_at"],
            }
            for row in rows
        ]
        conn.execute(
            "UPDATE notifications SET is_read = 1, read_at = datetime('now') WHERE user_id = ? AND is_read = 0",
            (user_id,),
        )
        conn.commit()
    finally:
        conn.close()
    return actions + informatives
