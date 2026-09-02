MAX_NOTIFICATIONS = 20
READ_EXPIRY_MINUTES = 30


def prune_expired(conn, user_id: int) -> None:
    """Supprime les notifications informatives lues il y a plus de
    READ_EXPIRY_MINUTES — les notifications d'action (cf.
    app.action_notifications) ne sont jamais persistées, donc jamais
    concernées par cette purge. Appelée en tête des deux endpoints de
    routers/notifications.py."""
    conn.execute(
        f"""
        DELETE FROM notifications
        WHERE user_id = ? AND is_read = 1 AND read_at IS NOT NULL
        AND read_at <= datetime('now', '-{READ_EXPIRY_MINUTES} minutes')
        """,
        (user_id,),
    )
    conn.commit()


def create_notification(conn, user_id: int, message: str, link: str | None = None) -> None:
    """Insère une notification et élague au-delà des MAX_NOTIFICATIONS plus
    récentes — le user ne consulte jamais que les dernières, pas la peine
    d'en tracker davantage. `link` est une route frontend optionnelle (ex:
    "/jeu/cartes") affichée comme lien cliquable sur la notification. `conn`
    n'est pas fermée ici (appelant responsable, même convention que le reste
    de l'app)."""
    conn.execute(
        "INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)",
        (user_id, message, link),
    )
    conn.execute(
        """
        DELETE FROM notifications
        WHERE user_id = ? AND id NOT IN (
            SELECT id FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?
        )
        """,
        (user_id, user_id, MAX_NOTIFICATIONS),
    )
    conn.commit()
