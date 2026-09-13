from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user_id
from app.data_loader import get_dataset
from app.level_bayesian import MASTERED_PROBS, estimate_level_probabilities

router = APIRouter(prefix="/api", tags=["qcm"])


@router.get("/qcm-niveau/questions")
def get_qcm_niveau_questions(user_id: int = Depends(get_current_user_id)):
    """Outil de conception (pas encore l'algorithme final de placement) :
    renvoie les 22 questions de traduction fr->he (item_qcm.json), triées
    par id (= ordre de présentation), chacune avec sa bonne réponse et ses 3
    distracteurs — le shuffle des 4 options et toute la logique (minuteur,
    score, arrêt) restent côté frontend, cf. demande explicite du user."""
    items = get_dataset("qcm_niveau")
    ordered = sorted(items.values(), key=lambda item: item["id"])
    return [
        {
            "id": item["id"],
            "fr": item["fr"],
            "setid": item["setid"],
            "correct_answer": item["he"],
            "level3_answer": item["answers"]["level3_answer"],
            "level2_answer": item["answers"]["level2_answer"],
            "level1_answer": item["answers"]["level1_answer"],
        }
        for item in ordered
    ]


class LevelEstimateRequest(BaseModel):
    scores: list[int]


@router.post("/qcm-niveau/estimate")
def post_qcm_niveau_estimate(payload: LevelEstimateRequest, user_id: int = Depends(get_current_user_id)):
    """Outil de conception : renvoie P(K | réponses) pour K = 0..11 (cf.
    app.level_bayesian, porté de instructions/algorithm_levelevaluation_bayesian.py)
    à partir des scores du QCM, dans l'ordre chronologique — cf. demande
    explicite du user. Clés renvoyées en chaînes (contrainte JSON), à
    recaster en entier côté frontend."""
    try:
        probabilities = estimate_level_probabilities(payload.scores, MASTERED_PROBS)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {str(k): v for k, v in probabilities.items()}
