import math

# Portage de instructions/algorithm_levelevaluation_bayesian.py (script de
# conception fourni par le user, hors de backend/ donc pas importable
# directement en prod) — logique reprise à l'identique, cf. demande
# explicite du user.

NUM_SETS = 11
QUESTIONS_PER_SET = 2
MASTERED_PROBS = {
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


def estimate_level_probabilities(
    scores: list[int],
    mastered_probs: dict[int, float],
) -> dict[int, float]:
    """Estime P(K | réponses) pour K = 0..11 (K = dernier set maîtrisé,
    0 = aucun, 11 = tous) — cf. instructions/algorithm_levelevaluation_bayesian.py
    pour le détail des hypothèses (2 questions/set, prior uniforme, un score
    0/timeout traité comme 1)."""
    if len(scores) > NUM_SETS * QUESTIONS_PER_SET:
        raise ValueError(f"Il ne peut pas y avoir plus de {NUM_SETS * QUESTIONS_PER_SET} scores.")

    if any(score not in (0, 1, 2, 3, 4) for score in scores):
        raise ValueError("Chaque score doit être compris entre 0 et 4.")

    if set(mastered_probs.keys()) != {1, 2, 3, 4}:
        raise ValueError("mastered_probs doit contenir exactement les clés 1, 2, 3 et 4.")

    if any(p <= 0 for p in mastered_probs.values()):
        raise ValueError("Toutes les probabilités doivent être strictement positives.")

    if not math.isclose(sum(mastered_probs.values()), 1.0, abs_tol=1e-9):
        raise ValueError("Les probabilités de mastered_probs doivent sommer à 1.")

    effective_scores = [max(score, 1) for score in scores]

    log_likelihoods = {}
    log_prior_k = -math.log(NUM_SETS + 1)

    for k in range(NUM_SETS + 1):
        log_probability = log_prior_k
        for question_index, score in enumerate(effective_scores):
            question_set = (question_index // QUESTIONS_PER_SET) + 1
            probability = mastered_probs[score] if question_set <= k else UNMASTERED_PROBS[score]
            log_probability += math.log(probability)
        log_likelihoods[k] = log_probability

    max_log_probability = max(log_likelihoods.values())
    unnormalized = {k: math.exp(log_p - max_log_probability) for k, log_p in log_likelihoods.items()}
    total = sum(unnormalized.values())
    return {k: value / total for k, value in unnormalized.items()}
