import sqlite3

from app.config import BACKEND_DIR

DB_PATH = BACKEND_DIR / "db.sqlite3"

# Application mono-utilisateur pour l'instant : un seul profil, id fixe.
DEFAULT_USER_ID = 1
DEFAULT_LEVEL = "0.01"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_connection()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY
            )
            """
        )

        # Log append-only : une ligne par évaluation. "success" pour les
        # auto-évaluations (mot/verbe/phrase, vrai/faux), "score" pour les
        # évaluations notées par le professeur Gemini (1 à 5).
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS evaluations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
                object_type TEXT NOT NULL,
                object_key TEXT NOT NULL,
                success INTEGER,
                score INTEGER,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_evaluations_combo
            ON evaluations (user_id, object_type, object_key, created_at DESC)
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_level (
                user_id INTEGER PRIMARY KEY REFERENCES users(id),
                level TEXT NOT NULL,
                level_since TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )

        conn.execute("INSERT OR IGNORE INTO users (id) VALUES (?)", (DEFAULT_USER_ID,))
        conn.execute(
            "INSERT OR IGNORE INTO user_level (user_id, level) VALUES (?, ?)",
            (DEFAULT_USER_ID, DEFAULT_LEVEL),
        )
        conn.commit()
    finally:
        conn.close()
