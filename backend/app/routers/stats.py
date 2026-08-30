from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import readiness
from app.stats import build_recency_stats, build_stats

router = APIRouter(prefix="/api", tags=["stats"])


class StatsRow(BaseModel):
    object_key: str
    rank: int
    content: str
    verb: str | None = None
    temps: str | None = None
    personne: str | None = None
    chapter: str | None
    lesson: str | None
    difficulty: float
    last_evaluations: list[bool]
    used_in_readiness: bool = False


class RecencyRow(BaseModel):
    object_key: str
    rank: int
    type: str
    content: str
    chapter: str | None
    lesson: str | None
    lessons_seen: int
    recency_weight: int


# Déclarée avant /stats/{tab} : sinon FastAPI matcherait "recence" comme
# valeur du paramètre {tab} de la route générique ci-dessous.
@router.get("/stats/recence", response_model=list[RecencyRow])
def get_recency_stats():
    return build_recency_stats()


@router.get("/stats/{tab}", response_model=list[StatsRow])
def get_stats(tab: str):
    used_keys = None
    if tab == "traduction.he":
        result = readiness.compute_readiness()
        used_keys = set(result.get("used_keys", []))
    rows = build_stats(tab, used_keys)
    if rows is None:
        raise HTTPException(404, "Onglet de statistiques inconnu")
    return rows
