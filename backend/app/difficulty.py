import random
from collections import defaultdict

from scipy.stats import beta

from app.database import DEFAULT_USER_ID, get_connection

# Une note (1-5) est négative si < 4 ; un succès booléen est négatif si False.
SCORE_NEGATIVE_THRESHOLD = 4


def _is_negative(success, score):
    if success is not None:
        return success == 0
    return score is not None and score < SCORE_NEGATIVE_THRESHOLD


def _define_weights(n: int) -> list:
    # Poids croissants avec la récence : le dernier élément (le plus récent)
    # pèse 5, l'avant-dernier 4, etc. — jusqu'à n éléments.
    return [5 - n + 1 + i for i in range(n)]


def _define_true_occurences(bool_list: list, weights_list: list) -> int:
    return sum(w for b, w in zip(bool_list, weights_list) if b)


def _define_statistics(bool_list: list) -> tuple:
    weights = _define_weights(len(bool_list))
    true_occ = _define_true_occurences(bool_list, weights)
    total_occ = sum(weights)
    return true_occ, total_occ


def _median_beta(stats: tuple) -> float:
    positives, total = stats
    # La valeur séparant la masse en 50% / 50% correspond à la médiane
    # (Percent Point Function à 0.5) pour la loi Beta(positives, total).
    return beta.ppf(0.5, positives, total)


def define_difficulty_score(bool_list: list) -> float:
    """Score de difficulté (0 à 1) à partir des 5 dernières évaluations d'un
    combo, du plus ancien (index 0) au plus récent — True = évaluation
    positive, False = négative. Liste vide acceptée (aucune évaluation
    encore faite). Modélise la difficulté comme la médiane a posteriori
    d'une loi Beta(échecs pondérés + 1, réussites pondérées + 1) — un objet
    jamais évalué obtient un score neutre de 0.5 plutôt que 0."""
    negatives = [not b for b in bool_list]
    pos, tot = _define_statistics(negatives)
    neg = tot - pos
    return _median_beta((pos + 1, neg + 1))


def compute_combo_difficulties(object_type: str) -> dict:
    """Score de difficulté par combo exact (object_key), basé sur les 5
    dernières évaluations (cf. define_difficulty_score) — c'est ce score qui
    sert de poids lors du tirage pondéré par difficulté (stratified_pick)."""
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
        # `evals` est trié du plus récent au plus ancien (requête SQL) ; on
        # ne garde que les 5 derniers puis on inverse pour repasser à l'ordre
        # attendu par define_difficulty_score (ancien -> récent).
        last5 = list(reversed(evals[:5]))
        bool_list = [not _is_negative(ev["success"], ev["score"]) for ev in last5]
        difficulties[key] = define_difficulty_score(bool_list)
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


def pick_sequential(pool, current=None):
    """Mode 'Nouveaux mots/verbes' : liste ordonnée des objets de la leçon,
    jamais de tirage aléatoire. On avance simplement au suivant, avec retour
    au premier élément une fois la liste parcourue."""
    if not pool:
        return None
    if current in pool:
        idx = pool.index(current)
        return pool[(idx + 1) % len(pool)]
    return pool[0]


def weighted_pick(difficulty_pool: dict, recency_pool: dict):
    """Tirage 50% pondéré par difficulté / 50% pondéré par récence dans la
    progression du cours, avec repli sur l'autre pool s'il est vide.

    `difficulty_pool` : {clé: score de difficulté} — seulement les combos
    déjà évalués au moins une fois (cf. compute_combo_difficulties).
    `recency_pool` : {clé: poids de récence} — tous les objets des leçons
    débloquées, évalués ou non (cf. lesson_order.recency_weights).

    Retourne (clé tirée, pool d'origine) où pool ∈ {"difficulty", "recency",
    None} — None seulement si aucun pool n'a de quoi tirer."""
    if not difficulty_pool and not recency_pool:
        return None, None

    roll = random.random()

    if roll < 0.5 and difficulty_pool:
        keys = list(difficulty_pool.keys())
        weights = list(difficulty_pool.values())
        return random.choices(keys, weights=weights, k=1)[0], "difficulty"

    if recency_pool:
        keys = list(recency_pool.keys())
        weights = list(recency_pool.values())
        return random.choices(keys, weights=weights, k=1)[0], "recency"

    keys = list(difficulty_pool.keys())
    weights = list(difficulty_pool.values())
    return random.choices(keys, weights=weights, k=1)[0], "difficulty"
