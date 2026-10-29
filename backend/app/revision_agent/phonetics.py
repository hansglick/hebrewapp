"""Tâche « Lecture » : transcription phonétique en lettres latines (cf. demande explicite du user).

Le prof (Gemini Live) écrit ce qu'il entend l'élève lire avec PHONETIC_CONVENTION ; chaque réplique des textes a sa
prononciation attendue, écrite avec la même convention par scripts/build_reading_phonetics.py dans
READING_PHONETICS. Le modèle rapide compare les deux pour juger les voyelles, que la transcription hébraïque (sans
nikkoud) ne montre pas.
"""

import json
from functools import cache

from app.config import DATA_DIR

READING_PHONETICS = DATA_DIR / "revision_reading_phonetics.json"  # {leçon: [{"phonetic", "pointed"}] par réplique}

PHONETIC_CONVENTION = """Convention de transcription phonétique (hébreu moderne israélien), en lettres latines :
- en minuscules, sans ponctuation ; un mot latin par mot hébreu, les préfixes collés au mot par un tiret
  (ba-ulpan, ve-hu, ha-sefer, she-ani) ;
- voyelles : a, e, i, o, u, telles qu'elles sont prononcées ; un shva prononcé s'écrit e, un shva muet ne s'écrit pas ;
- consonnes : b ou v (ב), g, d, h (ה prononcé ; ה muet final non écrit), v (ו consonne), z, kh (ח, et כ sans dagesh),
  t (ט, ת), y (י consonne), k (כ avec dagesh, ק), l, m, n, s (ס, שׂ), p ou f (פ), ts (צ), r, sh (שׁ), j, ch (« tch »)
  et zh pour les sons empruntés ;
- א et ע ne s'écrivent pas (seulement leur voyelle) ; pas de lettre doublée ; l'accent tonique n'est pas marqué."""


@cache
def references() -> dict[str, list[dict]]:
    try:
        return json.loads(READING_PHONETICS.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}


def reference(lesson: str, index: int) -> dict | None:
    """Prononciation attendue d'une réplique ({"phonetic", "pointed"}), si elle a été préparée."""
    phrases = references().get(lesson) or []
    return phrases[index] if index < len(phrases) else None
