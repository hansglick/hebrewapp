import math

# Variables fixes

NUM_SETS = 11
QUESTIONS_PER_SET = 2
mastered_probs = {
    4: 0.70,
    3: 0.20,
    2: 0.07,
    1: 0.03,
}
UNMASTERED_PROBS = {
    1: 0.25,
    2: 0.25,
    3: 0.25,
    4: 0.25,
}


# Fonction, un seul argument variables : scores qui est la liste des scores du user obtenu à chaque question et ordonnée chronologiquement (score de la premiere question en premier, score de la derniere question en dernier)

def estimate_level_probabilities(
    scores: list[int],
    mastered_probs: dict[int, float],
) -> dict[int, float]:
    """
    Estime P(K | réponses) pour K = 0..11.

    K représente le dernier set considéré comme maîtrisé :
        K = 0  -> aucun set maîtrisé
        K = 1  -> set 1 maîtrisé
        K = 2  -> sets 1 et 2 maîtrisés
        ...
        K = 11 -> tous les sets maîtrisés

    Hypothèses :
    - 2 questions par set
    - les questions arrivent chronologiquement :
        questions 1-2   -> set 1
        questions 3-4   -> set 2
        ...
    - un score 0 (timeout) est traité comme un score 1
    - P(score | set non maîtrisé) = 0.25 pour chacun des scores 1..4
    - prior uniforme sur K = 0..11

    Retour :
        {
            0: P(K=0 | réponses),
            1: P(K=1 | réponses),
            ...
            11: P(K=11 | réponses)
        }

    Les probabilités retournées somment à 1.
    """

    # ----------------------------
    # Validation des entrées
    # ----------------------------

    if len(scores) > NUM_SETS * QUESTIONS_PER_SET:
        raise ValueError(
            f"Il ne peut pas y avoir plus de "
            f"{NUM_SETS * QUESTIONS_PER_SET} scores."
        )

    if any(score not in (0, 1, 2, 3, 4) for score in scores):
        raise ValueError("Chaque score doit être compris entre 0 et 4.")

    if set(mastered_probs.keys()) != {1, 2, 3, 4}:
        raise ValueError(
            "mastered_probs doit contenir exactement les clés 1, 2, 3 et 4."
        )

    if any(p <= 0 for p in mastered_probs.values()):
        raise ValueError(
            "Toutes les probabilités doivent être strictement positives."
        )

    if not math.isclose(sum(mastered_probs.values()), 1.0, abs_tol=1e-9):
        raise ValueError(
            "Les probabilités de mastered_probs doivent sommer à 1."
        )

    # ----------------------------
    # Prétraitement
    # 0 (timeout) -> 1
    # ----------------------------

    effective_scores = [
        max(score, 1)
        for score in scores
    ]

    # ----------------------------
    # Calcul de log P(données | K)
    # ----------------------------

    log_likelihoods = {}

    # Prior uniforme sur les 12 hypothèses K = 0..11
    log_prior_k = -math.log(NUM_SETS + 1)

    for k in range(NUM_SETS + 1):

        log_probability = log_prior_k

        for question_index, score in enumerate(effective_scores):

            # questions 0,1 -> set 1
            # questions 2,3 -> set 2
            # etc.
            question_set = (
                question_index // QUESTIONS_PER_SET
            ) + 1

            if question_set <= k:
                probability = mastered_probs[score]
            else:
                probability = UNMASTERED_PROBS[score]

            log_probability += math.log(probability)

        log_likelihoods[k] = log_probability

    # ----------------------------
    # Normalisation stable
    # log-sum-exp
    # ----------------------------

    max_log_probability = max(log_likelihoods.values())

    unnormalized = {
        k: math.exp(log_p - max_log_probability)
        for k, log_p in log_likelihoods.items()
    }

    total = sum(unnormalized.values())

    posterior = {
        k: value / total
        for k, value in unnormalized.items()
    }

    return posterior