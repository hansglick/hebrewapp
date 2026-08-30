import os
import sqlite3
from pathlib import Path

from app.config import BACKEND_DIR

# En prod (Render), DB_PATH pointe vers le disque persistant monté (le
# système de fichiers du service lui-même est éphémère, remis à zéro à
# chaque déploiement) ; en local, la valeur par défaut ne change pas.
DB_PATH = Path(os.environ.get("DB_PATH", str(BACKEND_DIR / "db.sqlite3")))

# Application mono-utilisateur pour l'instant : un seul profil, id fixe.
DEFAULT_USER_ID = 1
# Sentinel "avant le tout début du cours" — PAS un vrai code de leçon
# (volontairement absent de all_lesson_codes_in_order). Les fonctions
# next_lesson_code/reference_lesson (app.lesson_order) traitent tout niveau
# introuvable comme précédant la toute première leçon du cours, ce qui rend
# ce choix arbitraire (n'importe quel code absent du dataset ferait
# l'affaire) mais explicite et sans ambiguïté avec un vrai niveau atteint.
DEFAULT_LEVEL = "0.00"


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
        # pseudo (hébreu, saisi à l'onboarding) et date de complétion de
        # l'examen d'entrée (NULL = onboarding pas encore fait -> l'app
        # affiche l'écran d'onboarding au lieu du reste, cf. GET
        # /api/onboarding/status).
        users_cols = [r["name"] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
        if "pseudo" not in users_cols:
            conn.execute("ALTER TABLE users ADD COLUMN pseudo TEXT")
        if "onboarding_completed_at" not in users_cols:
            conn.execute("ALTER TABLE users ADD COLUMN onboarding_completed_at TEXT")

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
        # même leçon.
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

        # Log append-only de chaque tentative d'examen (réussie ou non) —
        # sert au plafond de 3 tentatives/jour par format et à l'affichage
        # de la dernière note obtenue.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS exam_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
                lesson_code TEXT NOT NULL,
                exam_type TEXT NOT NULL CHECK (exam_type IN ('ecrit', 'oral')),
                passed INTEGER NOT NULL,
                score_ratio REAL NOT NULL,
                attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_exam_attempts_daily
            ON exam_attempts (user_id, exam_type, attempted_at)
            """
        )

        # Colonnes ajoutées après la création initiale de la table — pas de
        # système de migration ici, donc ALTER TABLE conditionnel.
        # questions_json/answers_json conservent la copie complète (questions,
        # réponses, observations Gemini) de chaque tentative terminée, pour
        # l'écran "Mes copies".
        attempt_cols = [r["name"] for r in conn.execute("PRAGMA table_info(exam_attempts)").fetchall()]
        if "average_note" not in attempt_cols:
            conn.execute("ALTER TABLE exam_attempts ADD COLUMN average_note REAL")
        if "questions_json" not in attempt_cols:
            conn.execute("ALTER TABLE exam_attempts ADD COLUMN questions_json TEXT")
        if "answers_json" not in attempt_cols:
            conn.execute("ALTER TABLE exam_attempts ADD COLUMN answers_json TEXT")

        # Tentative d'examen en cours (tirage figé + réponses déjà notées).
        # Une seule par (user, leçon, format) ; supprimée dès qu'elle est
        # complétée (cf. app.exam_session.record_answer).
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS exam_sessions (
                user_id INTEGER NOT NULL REFERENCES users(id),
                lesson_code TEXT NOT NULL,
                exam_type TEXT NOT NULL CHECK (exam_type IN ('ecrit', 'oral')),
                questions_json TEXT NOT NULL,
                answers_json TEXT NOT NULL,
                paused_seconds REAL NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (user_id, lesson_code, exam_type)
            )
            """
        )
        session_cols = [r["name"] for r in conn.execute("PRAGMA table_info(exam_sessions)").fetchall()]
        if "paused_seconds" not in session_cols:
            conn.execute("ALTER TABLE exam_sessions ADD COLUMN paused_seconds REAL NOT NULL DEFAULT 0")

        # Hard exam : défi global (pas de lesson_code), mélange tous les
        # types d'objets suivis en révision (mot/verbe/traduction/quizz/
        # oral). Une seule tentative en cours possible (PK sur user_id
        # seul). Le déverrouillage n'est PAS stocké ici : il est dérivé en
        # comparant exam_attempts.attempted_at (dernier examen régulier
        # réussi) à hard_exam_attempts.attempted_at (cf.
        # app.hard_exam.is_unlocked).
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS hard_exam_sessions (
                user_id INTEGER PRIMARY KEY REFERENCES users(id),
                questions_json TEXT NOT NULL,
                answers_json TEXT NOT NULL,
                paused_seconds REAL NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS hard_exam_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
                passed INTEGER NOT NULL,
                score_ratio REAL NOT NULL,
                average_note REAL NOT NULL,
                questions_json TEXT NOT NULL,
                answers_json TEXT NOT NULL,
                attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )

        # Notifications in-app (ex: "tu peux tenter le hard exam"). Pas de
        # pagination : le user ne consulte jamais plus que les 20 dernières,
        # cf. app.notifications.create_notification qui élague le surplus à
        # chaque insertion.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
                message TEXT NOT NULL,
                is_read INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        # `link` : route frontend optionnelle associée à la notification
        # (ex: "/jeu/cartes" pour "découvrez vos nouvelles cartes").
        notifications_cols = [r["name"] for r in conn.execute("PRAGMA table_info(notifications)").fetchall()]
        if "link" not in notifications_cols:
            conn.execute("ALTER TABLE notifications ADD COLUMN link TEXT")

        # "Vu" au moins une fois (mot/verbe/phrase/texte affiché à l'écran,
        # tous modes confondus) — sert au calcul de la progression
        # d'exploration d'une leçon (indicateur accueil/LeconDetailScreen).
        # INSERT OR IGNORE côté appelant : idempotent, pas d'historique de
        # répétition nécessaire, juste "a été vu au moins une fois".
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS object_views (
                user_id INTEGER NOT NULL REFERENCES users(id),
                object_type TEXT NOT NULL,
                object_key TEXT NOT NULL,
                first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (user_id, object_type, object_key)
            )
            """
        )

        # Historique des montées de niveau, pour la courbe de progression.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS level_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
                level TEXT NOT NULL,
                reached_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )

        # Wallet (points, tickets, cartes, gems) — cf. app.wallet, port de
        # instructions/wallet_behavior/simulation.py. Un lot de points par
        # (user, niveau d'origine), consommé FIFO (niveau croissant puis
        # ordre d'insertion) — mirroir de Portefeuille.points_par_niveau.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS wallet_points (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
                niveau INTEGER NOT NULL,
                points REAL NOT NULL,
                gagne_le TEXT NOT NULL
            )
            """
        )

        # Tickets achetés mais pas encore consommés — mirroir de
        # Portefeuille.tickets (un ticket individuel, jamais fusionné).
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS wallet_tickets (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                nom TEXT NOT NULL,
                distribution_points_json TEXT NOT NULL,
                montant_total REAL NOT NULL,
                achete_le TEXT NOT NULL
            )
            """
        )

        # Index des cartes possédées — mirroir de Portefeuille.possessions.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS wallet_cards (
                user_id INTEGER NOT NULL REFERENCES users(id),
                card_index INTEGER NOT NULL,
                acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (user_id, card_index)
            )
            """
        )
        # fiche_unlocked : une fois la fiche (nom + bio) consultée en
        # dépensant 1 gem, elle reste consultable gratuitement pour toujours
        # (cf. app.wallet.voir_fiche_carte).
        wallet_cards_cols = [r["name"] for r in conn.execute("PRAGMA table_info(wallet_cards)").fetchall()]
        if "fiche_unlocked" not in wallet_cards_cols:
            conn.execute("ALTER TABLE wallet_cards ADD COLUMN fiche_unlocked INTEGER NOT NULL DEFAULT 0")

        # Champs scalaires du portefeuille (gems, horodatage d'activité,
        # état d'arrondi cumulatif, palier d'inactivité déjà signalé...).
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS wallet_state (
                user_id INTEGER PRIMARY KEY REFERENCES users(id),
                gems INTEGER NOT NULL DEFAULT 0,
                dernier_gain_points TEXT,
                jours_inactivite_traites INTEGER NOT NULL DEFAULT 0,
                cartes_debut_inactivite INTEGER,
                erreur_total REAL NOT NULL DEFAULT 0,
                erreur_a REAL NOT NULL DEFAULT 0,
                version INTEGER NOT NULL DEFAULT 0,
                last_period_warned INTEGER NOT NULL DEFAULT 0
            )
            """
        )

        # Journal append-only des mutations du wallet (doc section 14/20 de
        # instructions/wallet_behavior) — pas encore exploité par un écran
        # dédié, conservé pour l'auditabilité et une extension future.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS wallet_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
                type TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )

        # Historique des crédits de points par leçon — sert à calculer la
        # division par deux appliquée à chaque repasse d'un examen déjà
        # réussi (cf. app.wallet.enregistrer_examen_reussi).
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS wallet_lesson_points_awarded (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
                lesson_code TEXT NOT NULL,
                points REAL NOT NULL,
                awarded_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )

        # Tentative en cours de l'examen d'entrée (une seule par user,
        # persistée pour survivre à un reload — cf. app.onboarding_exam).
        # `current_question_json` fige exactement la question déjà tirée et
        # affichée, pour ne jamais la retirer au hasard lors d'une reprise.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS onboarding_exam_progress (
                user_id INTEGER PRIMARY KEY REFERENCES users(id),
                question_number INTEGER NOT NULL,
                current_set INTEGER NOT NULL,
                oral_slots_json TEXT NOT NULL,
                current_question_json TEXT NOT NULL,
                history_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )

        conn.execute("INSERT OR IGNORE INTO users (id) VALUES (?)", (DEFAULT_USER_ID,))
        conn.execute(
            "INSERT OR IGNORE INTO wallet_state (user_id) VALUES (?)",
            (DEFAULT_USER_ID,),
        )
        conn.execute(
            "INSERT OR IGNORE INTO user_level (user_id, level) VALUES (?, ?)",
            (DEFAULT_USER_ID, DEFAULT_LEVEL),
        )

        # Backfill unique : aucune donnée historique n'existait avant
        # l'ajout de level_history, on recrée un premier point à partir du
        # niveau courant pour que la courbe ne démarre pas vide.
        has_history = conn.execute(
            "SELECT 1 FROM level_history WHERE user_id = ?", (DEFAULT_USER_ID,)
        ).fetchone()
        if not has_history:
            row = conn.execute(
                "SELECT level, level_since FROM user_level WHERE user_id = ?",
                (DEFAULT_USER_ID,),
            ).fetchone()
            if row:
                conn.execute(
                    "INSERT INTO level_history (user_id, level, reached_at) VALUES (?, ?, ?)",
                    (DEFAULT_USER_ID, row["level"], row["level_since"]),
                )

        # Backfill unique (ajout de onboarding_completed_at) : un compte qui
        # a déjà progressé au-delà du sentinel de départ a nécessairement
        # déjà "fait" l'équivalent d'un onboarding avant que cette
        # fonctionnalité n'existe — on ne doit pas le renvoyer de force sur
        # l'écran d'onboarding. Seul un compte encore à DEFAULT_LEVEL (neuf,
        # ou réinitialisé) doit voir needs_onboarding=True.
        level_row = conn.execute(
            "SELECT level FROM user_level WHERE user_id = ?", (DEFAULT_USER_ID,)
        ).fetchone()
        onboarding_row = conn.execute(
            "SELECT onboarding_completed_at FROM users WHERE id = ?", (DEFAULT_USER_ID,)
        ).fetchone()
        if (
            level_row
            and level_row["level"] != DEFAULT_LEVEL
            and onboarding_row
            and onboarding_row["onboarding_completed_at"] is None
        ):
            conn.execute(
                "UPDATE users SET onboarding_completed_at = datetime('now') WHERE id = ?",
                (DEFAULT_USER_ID,),
            )

        conn.commit()
    finally:
        conn.close()



# Tables entièrement vidées par reset_account (mono-user : chaque ligne
# appartient de toute façon à DEFAULT_USER_ID, donc un DELETE sans WHERE est
# équivalent et plus simple).
_RESET_TABLES = (
    "evaluations",
    "exam_progress",
    "exam_attempts",
    "exam_sessions",
    "hard_exam_sessions",
    "hard_exam_attempts",
    "notifications",
    "object_views",
    "level_history",
    "wallet_points",
    "wallet_tickets",
    "wallet_cards",
    "wallet_state",
    "wallet_events",
    "wallet_lesson_points_awarded",
    "user_level",
    "onboarding_exam_progress",
)


def reset_account() -> None:
    """Remet le compte (mono-user) à zéro pour simuler un nouvel onboarding —
    vide entièrement toute progression (niveau, examens, évaluations,
    wallet, vues, pseudo) et réinsère les mêmes lignes de bootstrap que
    init_db() (wallet_state, user_level=DEFAULT_LEVEL, premier point de
    level_history). Action explicitement destructive, déclenchée uniquement
    par le bouton "Réinitialiser mon compte" (cf. routers/onboarding.py)."""
    conn = get_connection()
    try:
        for table in _RESET_TABLES:
            conn.execute(f"DELETE FROM {table}")
        conn.execute(
            "UPDATE users SET pseudo = NULL, onboarding_completed_at = NULL WHERE id = ?",
            (DEFAULT_USER_ID,),
        )
        conn.execute(
            "INSERT INTO wallet_state (user_id) VALUES (?)",
            (DEFAULT_USER_ID,),
        )
        conn.execute(
            "INSERT INTO user_level (user_id, level) VALUES (?, ?)",
            (DEFAULT_USER_ID, DEFAULT_LEVEL),
        )
        conn.execute(
            "INSERT INTO level_history (user_id, level, reached_at) VALUES (?, ?, datetime('now'))",
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
        conn.execute(
            "INSERT INTO level_history (user_id, level, reached_at) VALUES (?, ?, datetime('now'))",
            (DEFAULT_USER_ID, level),
        )
        conn.commit()
    finally:
        conn.close()
