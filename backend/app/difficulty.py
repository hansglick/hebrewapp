import random
from collections import defaultdict

from app.database import DEFAULT_USER_ID, get_connection

# Une note (1-5) est négative si < 4 ; un succès booléen est négatif si False.
SCORE_NEGATIVE_THRESHOLD = 4


def _is_negative(success, score):
    if success is not None:
        return success == 0
    return score is not None and score < SCORE_NEGATIVE_THRESHOLD


def compute_combo_difficulties(object_type: str) -> dict:
    """Score de difficulté par combo exact (object_key), basé sur les 5 dernières
    évaluations : poids 5 (plus récente) à 1 (plus ancienne), somme des poids des
    évaluations négatives uniquement."""
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT object_key, success, score, created_at
            FROM evaluations
            WHERE user_id = ? AND object_type = ?
            ORDER BY object_key, created_at DESC, id DESC
            """,
            (DEFAULT_USER_ID, object_type),
        ).fetchall()
    finally:
        conn.close()

    by_key = defaultdict(list)
    for row in rows:
        by_key[row["object_key"]].append(row)

    difficulties = {}
    for key, evals in by_key.items():
        last5 = evals[:5]
        total = 0
        for rank, ev in enumerate(last5, start=1):  # rank 1 = la plus récente
            if _is_negative(ev["success"], ev["score"]):
                total += 6 - rank
        if total > 0:
            difficulties[key] = total
    return difficulties


def aggregate_by_base_key(difficulties: dict, sep: str = "|") -> dict:
    """Agrège les difficultés par clé de base (segment avant le premier séparateur),
    pour les objets (mot/verbe) où la langue/temps/personne ne change pas
    l'identité de l'objet réellement montré à l'utilisateur."""
    aggregated = defaultdict(float)
    for key, value in difficulties.items():
        base = key.split(sep)[0]
        aggregated[base] += value
    return dict(aggregated)


def stratified_pick(own_pool, cumulative_pool, difficulties):
    """Tirage 50% leçon associée / 30% pondéré par difficulté / 20% leçons
    précédentes, avec repli raisonnable si un des pools est vide."""
    if not own_pool and not cumulative_pool:
        return None

    roll = random.random()

    if roll < 0.5 and own_pool:
        return random.choice(own_pool)

    if roll < 0.8:
        candidates = [k for k in cumulative_pool if difficulties.get(k, 0) > 0]
        if candidates:
            weights = [difficulties[k] for k in candidates]
            return random.choices(candidates, weights=weights, k=1)[0]
    else:
        previous = [k for k in cumulative_pool if k not in own_pool]
        if previous:
            return random.choice(previous)

    return random.choice(own_pool) if own_pool else random.choice(cumulative_pool)
