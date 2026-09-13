import random

from app.data_loader import get_dataset
from app.onboarding_exam import build_sets


def sample_hebrew_sentences_per_set(k_per_set: int = 2, seed: int | None = None) -> dict[str, list[dict]]:
    """Tirage aléatoire stratifié SANS remise de `k_per_set` phrases par set,
    pour chacun des 11 sets qui regroupent les 159 leçons (cf.
    app.onboarding_exam.build_sets — même découpage que l'algorithme de
    placement).

    Pour chaque set, le pool (la strate) est l'ensemble des paires
    fr/hébreu (item_phrase.json) de toutes les leçons du set, et le tirage
    y est uniforme (pas de pondération) — chaque phrase du pool a la même
    chance d'être choisie, jamais deux fois pour le même set.

    Renvoie {setid ("01".."11"): [phrase, ...]} où chaque `phrase` est
    l'objet original du dataset (au moins les clés "hebrew" et "french").

    Lève ValueError si un set ne compte pas au moins `k_per_set` phrases
    dans son pool.
    """
    rng = random.Random(seed)
    sets = build_sets()
    phrases_data = get_dataset("phrase")

    result = {}
    for set_index, lesson_codes in enumerate(sets, start=1):
        pool = [phrase for code in lesson_codes for phrase in phrases_data.get(code, [])]
        if len(pool) < k_per_set:
            raise ValueError(
                f"Set {set_index:02d} : seulement {len(pool)} phrase(s) disponible(s), "
                f"{k_per_set} demandées."
            )
        result[f"{set_index:02d}"] = rng.sample(pool, k_per_set)

    return result
