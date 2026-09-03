"""Identité multi-utilisateurs légère (pseudo + code PIN, pas une vraie
authentification) — cf. app.database.register_user/login_user pour la
logique de compte, et app.routers.auth pour les endpoints /api/auth/*.

Volontairement PAS de fallback vers DEFAULT_USER_ID quand les en-têtes sont
absents : un fallback semblait pratique pour ne rien casser, mais il
ouvrirait la faille qu'on cherche justement à fermer — n'importe quel
visiteur sans identité stockée atterrirait silencieusement sur le compte
réel plutôt que d'être invité à s'enregistrer."""

import re
from urllib.parse import unquote

from fastapi import Header, HTTPException

from app.database import get_connection

# Bloc hébreu Unicode (lettres + niqqud + cantillation) + espaces — un pseudo
# n'a besoin de rien de plus, tout le reste est retiré silencieusement plutôt
# que rejeté (évite un aller-retour de validation gênant pour une simple
# saisie sur mobile).
_NON_HEBREW_RE = re.compile(r"[^֐-׿\s]")


def sanitize_pseudo(raw: str) -> str:
    return _NON_HEBREW_RE.sub("", raw).strip()


def get_user_id(pseudo: str, pin: str) -> int | None:
    conn = get_connection()
    try:
        row = conn.execute("SELECT id FROM users WHERE pseudo = ? AND pin = ?", (pseudo, pin)).fetchone()
    finally:
        conn.close()
    return row["id"] if row is not None else None


def get_current_user_id(x_pseudo: str = Header(...), x_pin: str = Header(...)) -> int:
    # Les valeurs d'en-tête HTTP sont limitées à ASCII/Latin-1 par la norme —
    # un pseudo hébreu brut y serait rejeté ou tronqué (côté navigateur,
    # fetch() lève même une TypeError sur un header contenant des caractères
    # hors Latin-1). Le frontend envoie donc le pseudo encodé en
    # pourcentage (encodeURIComponent), à décoder ici avant comparaison.
    pseudo = unquote(x_pseudo)
    user_id = get_user_id(pseudo, x_pin)
    if user_id is None:
        raise HTTPException(401, "Identité inconnue")
    return user_id
