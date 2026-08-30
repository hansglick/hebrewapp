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
    "celeb": "item_celeb.json",
    "proverb": "item_proverb.json",
    "tanakh": "item_tanakh.json",
    "recit": "item_recit.json",
    "landmark": "item_landmark.json",
    "blague": "item_blague.json",
    "hebreworiginword": "item_hebreworiginword.json",
    "jdr": "item_jdr.json",
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


def add_chanson(videodata: dict) -> None:
    """Ajoute une nouvelle chanson au dataset en mémoire (déjà partagé par
    tous les appels get_dataset("chanson") via le cache) et la persiste sur
    disque."""
    chansons = _load_all()["chanson"]
    chansons.append(videodata)
    with open(DATA_DIR / DATA_FILES["chanson"], "w", encoding="utf-8") as f:
        json.dump(chansons, f, ensure_ascii=False, indent=4)
