"""Outil de curation manuelle des phrases fr/hébreu (cf. demande explicite
du user : plusieurs sets du test conversationnel contiennent des phrases
"poubelles", à écarter à la main avant de les servir en vrai test).
Parcourt le même pool dédupliqué que app.phrase_sampling.phrases_by_set
(celui réellement tiré par app.routers.conversation_eval), et persiste les
phrases retenues dans un fichier JSON versionné (backend/data), pour que la
sélection survive aux redémarrages et puisse être committée."""

import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth import get_current_user_id
from app.config import DATA_DIR
from app.phrase_sampling import phrases_by_set

router = APIRouter(prefix="/api/phrase-curation", tags=["phrase-curation"])

SELECTION_FILE = DATA_DIR / "selected_phrases.json"


def _load_selection() -> dict[str, list[str]]:
    if not SELECTION_FILE.exists():
        return {}
    with open(SELECTION_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_selection(selection: dict[str, list[str]]) -> None:
    with open(SELECTION_FILE, "w", encoding="utf-8") as f:
        json.dump(selection, f, ensure_ascii=False, indent=2)


@router.get("/sets")
def get_phrase_sets(user_id: int = Depends(get_current_user_id)):
    """Renvoie, pour chacun des 11 sets, la liste (dédupliquée) des phrases
    fr/hébreu avec un id stable ("{set}:{position dans le pool dédupliqué}")
    et leur statut de sélection courant."""
    pools = phrases_by_set()
    selection = _load_selection()
    result = {}
    for set_index, pool in pools.items():
        selected_ids = set(selection.get(str(set_index), []))
        result[str(set_index)] = [
            {
                "id": f"{set_index}:{i}",
                "french": phrase["french"],
                "hebrew": phrase["hebrew"],
                "selected": f"{set_index}:{i}" in selected_ids,
            }
            for i, phrase in enumerate(pool)
        ]
    return result


class ToggleRequest(BaseModel):
    set: int
    id: str
    selected: bool


@router.post("/toggle")
def toggle_phrase_selection(payload: ToggleRequest, user_id: int = Depends(get_current_user_id)):
    selection = _load_selection()
    key = str(payload.set)
    ids = set(selection.get(key, []))
    if payload.selected:
        ids.add(payload.id)
    else:
        ids.discard(payload.id)
    selection[key] = sorted(ids)
    _save_selection(selection)
    return {"ok": True, "count": len(ids)}
