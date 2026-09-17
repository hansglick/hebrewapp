import json
import random

from app.config import DATA_DIR
from app.data_loader import get_dataset
from app.onboarding_exam import build_sets

# Sélection manuelle faite via l'outil de curation (/dev/phrase-curation) —
# fichier versionné (backend/data), pas le disque persistant en prod,
# puisqu'il s'agit d'un choix éditorial destiné à être committé une fois
# fait, cf. demande explicite du user.
SELECTED_PHRASES_FILE = DATA_DIR / "selected_phrases.json"


def load_selected_phrase_ids() -> dict[str, list[str]]:
    if not SELECTED_PHRASES_FILE.exists():
        return {}
    with open(SELECTED_PHRASES_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_selected_phrase_ids(selection: dict[str, list[str]]) -> None:
    with open(SELECTED_PHRASES_FILE, "w", encoding="utf-8") as f:
        json.dump(selection, f, ensure_ascii=False, indent=2)


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


def phrases_by_set() -> dict[int, list[dict]]:
    """Pool COMPLET (pas un tirage) de phrases fr/hébreu pour chacun des 11
    sets — sert au tirage dynamique piloté en direct par la conversation
    (cf. app.routers.conversation_eval, outil `next_question`), qui a besoin
    de piocher une phrase à la fois, au fil de la conversation, plutôt que
    de pré-tirer un nombre fixe de phrases une bonne fois pour toutes (cf.
    sample_hebrew_sentences_per_set ci-dessus, utilisé par le Test
    Challenger).

    Dédupliqué par texte français : plusieurs leçons peuvent contenir la
    même phrase française (dataset item_phrase.json), ce qui sinon permet de
    tirer littéralement la même question deux fois au sein d'un même set."""
    sets = build_sets()
    phrases_data = get_dataset("phrase")
    result = {}
    for set_index, lesson_codes in enumerate(sets, start=1):
        seen_french = set()
        pool = []
        for code in lesson_codes:
            for phrase in phrases_data.get(code, []):
                french = phrase["french"]
                if french in seen_french:
                    continue
                seen_french.add(french)
                pool.append(phrase)
        result[set_index] = pool
    return result


def selected_phrases_by_set() -> dict[int, list[dict]]:
    """Sous-ensemble de phrases_by_set() retenu manuellement par le user via
    l'outil de curation (/dev/phrase-curation), pour écarter les phrases
    "poubelles" du vrai test conversationnel — cf. demande explicite du
    user. Les ids ("{set}:{position}") sont ceux calculés par
    app.routers.phrase_curation, dans la même énumération de
    phrases_by_set() : la correspondance ne tient que parce que les deux
    parcourent le pool dans le même ordre déterministe.

    Si un set n'a AUCUNE phrase marquée (curation pas encore faite pour ce
    set), retombe sur son pool complet plutôt que de laisser le test sans
    aucune question à y piocher."""
    pools = phrases_by_set()
    selection = load_selected_phrase_ids()
    result = {}
    for set_index, pool in pools.items():
        selected_ids = set(selection.get(str(set_index), []))
        if not selected_ids:
            result[set_index] = pool
            continue
        result[set_index] = [phrase for i, phrase in enumerate(pool) if f"{set_index}:{i}" in selected_ids]
    return result
