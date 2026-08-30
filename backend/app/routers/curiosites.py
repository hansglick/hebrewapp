import random

from fastapi import APIRouter, HTTPException

from app.database import get_connection
from app import curiosites

router = APIRouter(prefix="/api/curiosites", tags=["curiosites"])


def _check_type(curiosite_type: str) -> None:
    if curiosite_type not in curiosites.CURIOSITE_TYPES:
        raise HTTPException(404, f"Type de curiosité inconnu : {curiosite_type!r}")


@router.get("/lesson/{code}")
def lesson_curiosites(code: str):
    """Types ayant une nouveauté précisément à cette leçon — pour savoir si
    la tuile "Curiosité" doit s'afficher sur la fiche de la leçon, et
    lesquels de ses sous-tuiles proposer."""
    position = curiosites.lesson_position(code)
    if position is None:
        raise HTTPException(404, f"Leçon introuvable : {code!r}")
    types = [t for t in curiosites.CURIOSITE_TYPES if curiosites.pool_delta(t, position)]
    return {"types": types}


@router.get("/random-any")
def random_any_curiosite():
    """Item vraiment aléatoire, tous types confondus, sans respecter le
    déblocage progressif — utilisé pour distraire le user pendant l'attente
    d'une correction Gemini sur un examen long/très long (peut montrer un
    item pas encore débloqué, cf. app.curiosites.random_any_item)."""
    item = curiosites.random_any_item()
    if item is None:
        raise HTTPException(404, "Aucun élément disponible")
    return item


@router.get("/{curiosite_type}/random")
def random_curiosite(curiosite_type: str, lesson_code: str | None = None, current: int | None = None):
    """Tire un item au hasard dans le pool débloqué : le delta d'une leçon
    précise si `lesson_code` est fourni (tuile "Curiosité"), sinon le cumul
    débloqué à la position courante de l'étudiant (écrans "Fun")."""
    _check_type(curiosite_type)

    if lesson_code is not None:
        position = curiosites.lesson_position(lesson_code)
        if position is None:
            raise HTTPException(404, f"Leçon introuvable : {lesson_code!r}")
        pool = curiosites.pool_delta(curiosite_type, position)
    else:
        conn = get_connection()
        try:
            position = curiosites.current_lesson_position(conn)
        finally:
            conn.close()
        pool = curiosites.pool_cumulatif(curiosite_type, position)

    if not pool:
        raise HTTPException(404, "Aucun élément débloqué pour ce type à ce stade")

    candidates = [i for i in pool if i != current] or pool
    index = random.choice(candidates)
    item = curiosites.get_item(curiosite_type, index)
    if item is None:
        raise HTTPException(404, "Élément introuvable")
    return item


@router.get("/{curiosite_type}/{index}")
def get_curiosite(curiosite_type: str, index: int):
    _check_type(curiosite_type)
    item = curiosites.get_item(curiosite_type, index)
    if item is None:
        raise HTTPException(404, "Élément introuvable")
    return item
