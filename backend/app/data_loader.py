import json
from functools import lru_cache

from app.config import DATA_DIR

# Nom du fichier JSON pour chaque type d'objet du cahier des charges
DATA_FILES = {
    "binyan": "item_binyan.json",
    "racine": "item_racine.json",
    "expression": "item_expression.json",
    "presse": "item_presse.json",
    "chanson": "item_chanson.json",
    "verbe": "item_verbe.json",
    "word": "item_word.json",
    "phrase": "item_phrase.json",
    "text": "item_text.json",
    "lesson": "item_lesson.json",
    "chapitre": "item_chapitre.json",
}


@lru_cache(maxsize=1)
def _load_all() -> dict:
    data = {}
    for key, filename in DATA_FILES.items():
        with open(DATA_DIR / filename, "r", encoding="utf-8") as f:
            data[key] = json.load(f)
    return data


def get_dataset(name: str):
    """Retourne le contenu JSON déjà chargé en mémoire pour un type d'objet donné."""
    return _load_all()[name]
