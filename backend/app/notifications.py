from app.database import DEFAULT_USER_ID

MAX_NOTIFICATIONS = 20


def create_notification(conn, message: str, link: str | None = None) -> None:
    """Insère une notification et élague au-delà des MAX_NOTIFICATIONS plus
    récentes — le user ne consulte jamais que les dernières, pas la peine
    d'en tracker davantage. `link` est une route frontend optionnelle (ex:
    "/jeu/cartes") affichée comme lien cliquable sur la notification. `conn`
    n'est pas fermée ici (appelant responsable, même convention que le reste
    de l'app)."""
    conn.execute(
        "INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)",
        (DEFAULT_USER_ID, message, link),
    )
    conn.execute(
        """
        DELETE FROM notifications
        WHERE user_id = ? AND id NOT IN (
            SELECT id FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?
        )
        """,
        (DEFAULT_USER_ID, DEFAULT_USER_ID, MAX_NOTIFICATIONS),
    )
    conn.commit()
