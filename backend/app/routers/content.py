import random
from functools import lru_cache

from fastapi import APIRouter, HTTPException

from app.config import DATA_DIR
from app import curiosites
from app.data_loader import get_dataset
from app.database import get_connection
from app.hebrew_text import strip_nikud

router = APIRouter(prefix="/api", tags=["content"])

WAITING_VIDS_DIR = DATA_DIR / "waiting_vids"


# --- Vidéos d'attente : jouées en boucle pendant qu'une requête Gemini est en cours ---
@router.get("/waiting-vids")
def list_waiting_vids():
    if not WAITING_VIDS_DIR.is_dir():
        return []
    return sorted(f.name for f in WAITING_VIDS_DIR.iterdir() if f.suffix.lower() == ".mp4")


# --- Binyan : dict, ordre naturel (pas de tirage aléatoire, swipe = suivant dans l'ordre) ---
@router.get("/binyans")
def list_binyans():
    return get_dataset("binyan")


@router.get("/binyans/{nom}")
def get_binyan(nom: str):
    data = get_dataset("binyan")
    if nom not in data:
        raise HTTPException(404, "Binyan introuvable")
    return data[nom]


# --- Racine : dict, tirage aléatoire ---
@router.get("/racines/random")
def random_racine():
    data = get_dataset("racine")
    key = random.choice(list(data.keys()))
    return data[key]


@router.get("/racines/{shoresh}")
def get_racine(shoresh: str):
    data = get_dataset("racine")
    if shoresh not in data:
        raise HTTPException(404, "Racine introuvable")
    return data[shoresh]


# --- Expression : liste, tirage aléatoire parmi les débloquées ---
@router.get("/expressions/random")
def random_expression():
    conn = get_connection()
    try:
        position = curiosites.current_lesson_position(conn)
    finally:
        conn.close()
    pool = curiosites.pool_cumulatif("expression", position)
    if not pool:
        raise HTTPException(404, "Aucune expression débloquée pour l'instant")
    data = get_dataset("expression")
    index = random.choice(pool)
    match = next((item for item in data if item["index"] == index), None)
    if match is None:
        raise HTTPException(404, "Expression introuvable")
    return match


@router.get("/expressions/{index}")
def get_expression(index: int):
    data = get_dataset("expression")
    match = next((item for item in data if item["index"] == index), None)
    if match is None:
        raise HTTPException(404, "Expression introuvable")
    return match


# --- Presse : liste, tirage aléatoire parmi les débloquées ---
@router.get("/presse/random")
def random_presse():
    conn = get_connection()
    try:
        position = curiosites.current_lesson_position(conn)
    finally:
        conn.close()
    pool = curiosites.pool_cumulatif("presse", position)
    if not pool:
        raise HTTPException(404, "Aucune une de presse débloquée pour l'instant")
    data = get_dataset("presse")
    index = random.choice(pool)
    match = next((item for item in data if item["index"] == index), None)
    if match is None:
        raise HTTPException(404, "Une de presse introuvable")
    return match


@router.get("/presse/{index}")
def get_presse(index: int):
    data = get_dataset("presse")
    match = next((item for item in data if item["index"] == index), None)
    if match is None:
        raise HTTPException(404, "Une de presse introuvable")
    return match


# --- Chanson : liste sans champ index -> position dans la liste ---
@router.get("/chansons")
def list_chansons():
    return get_dataset("chanson")


@router.get("/chansons/random")
def random_chanson():
    data = get_dataset("chanson")
    return random.choice(data)


@router.get("/chansons/{position}")
def get_chanson(position: int):
    data = get_dataset("chanson")
    if position < 0 or position >= len(data):
        raise HTTPException(404, "Chanson introuvable")
    return data[position]


# --- Dictionnaire : index combiné mot/verbe/racine, recherche he<->fr ---
@lru_cache(maxsize=1)
def _dictionnaire_index() -> list[dict]:
    entries = []
    for entry in get_dataset("word").values():
        entries.append(
            {
                "hebrew": entry["pure"],
                "hebrew_nikud": entry.get("original"),
                "french": entry["french"],
                "type": "mot",
                "racine": entry.get("racine") or None,
            }
        )
    for key, entry in get_dataset("verbe").items():
        entries.append(
            {
                "hebrew": entry["pure"],
                "hebrew_nikud": entry.get("original"),
                "french": entry["traduction"],
                "type": "verbe",
                "verbe_key": key,
            }
        )
    for racine in get_dataset("racine").values():
        for word in racine.get("words", []):
            # Le champ "hebrew" des mots liés à une racine n'est pas
            # systématiquement sans nikud dans les données (contrairement à
            # "pure" côté mot/verbe) : on le normalise nous-mêmes pour
            # garantir une recherche insensible au nikud sur toutes les
            # sources, et pour un dédoublonnage cohérent avec mot/verbe.
            raw = word["hebrew"]
            pure = strip_nikud(raw)
            entries.append(
                {"hebrew": pure, "hebrew_nikud": raw if raw != pure else None, "french": word["french"], "type": "racine"}
            )

    # Dédoublonnage : les entrées mot/verbe (avec nikud) sont ajoutées avant
    # celles issues des racines, donc priment en cas de doublon exact.
    seen = set()
    deduped = []
    for entry in entries:
        key = (entry["hebrew"], entry["french"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(entry)
    return deduped


@router.get("/dictionnaire")
def search_dictionnaire(query: str, mode: str):
    if mode not in ("he_fr", "fr_he"):
        raise HTTPException(400, "mode invalide")

    query = query.strip()
    if not query:
        return []

    entries = _dictionnaire_index()
    if mode == "he_fr":
        q = strip_nikud(query)
        normalize = lambda e: e["hebrew"]  # noqa: E731
    else:
        q = query.lower()
        normalize = lambda e: e["french"].lower()  # noqa: E731

    # Un simple tri alphabétique sur les résultats "contient" mélange une
    # correspondance exacte (ex: "table") avec des mots qui la contiennent
    # seulement en fin de chaîne (ex: "acceptable", "comptable") et qui
    # peuvent lui être alphabétiquement antérieurs — l'exact/préfixe doit
    # toujours primer, quel que soit l'ordre alphabétique.
    exact, starts, contains = [], [], []
    for e in entries:
        value = normalize(e)
        if q not in value:
            continue
        if value == q:
            exact.append(e)
        elif value.startswith(q):
            starts.append(e)
        else:
            contains.append(e)

    exact.sort(key=normalize)
    starts.sort(key=normalize)
    contains.sort(key=normalize)

    return (exact + starts + contains)[:100]
