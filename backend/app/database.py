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

        # Trace la réussite d'un examen (écrit ou oral) pour une leçon cible.
        # Le niveau ne monte que lorsque les deux types sont réussis pour la
        # même leçon (sauf mode hors-ligne, écrit seul).
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS exam_progress (
                user_id INTEGER NOT NULL REFERENCES users(id),
                lesson_code TEXT NOT NULL,
                exam_type TEXT NOT NULL CHECK (exam_type IN ('ecrit', 'oral')),
                passed_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (user_id, lesson_code, exam_type)
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


def set_user_level(level: str) -> None:
    conn = get_connection()
    try:
        conn.execute(
            "UPDATE user_level SET level = ?, level_since = datetime('now') WHERE user_id = ?",
            (level, DEFAULT_USER_ID),
        )
        conn.commit()
    finally:
        conn.close()
