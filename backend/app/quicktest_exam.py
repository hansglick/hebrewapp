"""Algorithme adaptatif de test de positionnement ("Quick Test") — cf.
instructions/algorithm_levelevaluation.txt et la discussion avec le user qui
a précisé les 3 constantes numériques (MODALITY_GAP_THRESHOLD,
ORAL_SPREAD_THRESHOLD, SAFETY_MARGIN_SETS).

Contrairement à l'examen d'entrée classique (app.onboarding_exam, qui
choisit "le set suivant" via une fenêtre symétrique autour du set courant),
cet algorithme maintient en permanence une fenêtre [lower_bound,
upper_bound] sur les 11 sets et la resserre par bissection. Dès que la
fenêtre est étroite ET que la confiance est suffisante (écrit/oral non
contradictoires, pas de dispersion orale forte, aucun score 3 non
confirmé), le test s'arrête — entre 4 et 6 questions selon les cas,
contre 7 questions fixes pour l'algorithme classique.

Réutilise le tirage de questions (draw_question, build_sets) de
app.onboarding_exam plutôt que de le dupliquer — seule la LOGIQUE DE
SÉLECTION (quel set, quelle modalité, quand s'arrêter) diffère.
"""

import math

from app.database import DEFAULT_LEVEL
from app.lesson_order import all_lesson_codes_in_order
from app.onboarding_exam import build_sets, draw_question

NUM_SETS = 11
LOWER_BOUND_INIT = 0
UPPER_BOUND_INIT = 12
MIN_QUESTIONS = 4
NORMAL_MAX_QUESTIONS = 5
ABSOLUTE_MAX_QUESTIONS = 6

# Constantes précisées explicitement par le user (cf. discussion) — pas de
# valeur "au jugé" : 1.5 pour la contradiction écrit/oral (un écart de 2
# points est déjà trop important avec seulement 2 réponses de chaque côté),
# 2 pour la dispersion orale (5/3/5 ou 5/2/5 doit réduire la confiance),
# marge de sécurité d'un set réservée aux seuls cas de confiance
# insuffisante en fin de test (pas systématique, contrairement à l'ancien
# algorithme).
MODALITY_GAP_THRESHOLD = 1.5
ORAL_SPREAD_THRESHOLD = 2
SAFETY_MARGIN_SETS = 1

FIXED_MODALITY = {1: "ecrit", 2: "oral", 3: "ecrit", 4: "oral"}


def round_half_up(x: float) -> int:
    """Arrondi "classique" (pas le round-half-to-even de Python) — utilisé
    pour convertir la moyenne non arrondie d'une réponse orale en note 1-5
    pour la mise à jour des bornes (cf. demande explicite du user : garder
    la précision non arrondie pour le calcul de confiance, mais un entier
    pour la navigation entre sets)."""
    return math.floor(x + 0.5)


def oral_sub_scores(result: dict) -> list:
    return [result["rating_completeness"], result["rating_hebrew"], result["rating_comprehension"]]


def make_history_entry(question_number: int, set_index: int, kind: str, result: dict) -> dict:
    """`score` : note Gemini brute (entier) pour l'écrit, moyenne NON
    arrondie des 3 composantes pour l'oral (cf. demande explicite du user
    — ne pas jeter cette précision pour le calcul de confiance).
    `rounded_score` : version entière (arrondi classique pour l'oral),
    utilisée pour la mise à jour des bornes. `spread` : dispersion max-min
    des 3 notes orales, None pour l'écrit."""
    if kind == "ecrit":
        score = result["score"]
        return {
            "question_number": question_number,
            "set": set_index,
            "kind": kind,
            "score": score,
            "rounded_score": score,
            "spread": None,
        }
    sub_scores = oral_sub_scores(result)
    mean = sum(sub_scores) / len(sub_scores)
    return {
        "question_number": question_number,
        "set": set_index,
        "kind": kind,
        "score": mean,
        "rounded_score": round_half_up(mean),
        "spread": max(sub_scores) - min(sub_scores),
    }


def apply_entry(lower_bound: int, upper_bound: int, pending: int | None, entry: dict):
    """Met à jour (lower_bound, upper_bound, pending_confirmation_set)
    après une réponse — cf. points 4/5 de l'algorithme. Le cas "encore 3
    sur le set de confirmation" (2e 3 consécutif au même set) resserre la
    fenêtre à exactement ce set plutôt que de laisser lower/upper
    inchangés : sans ça, un midpoint inchangé reproposerait indéfiniment
    le même set — cf. demande explicite du user (garde-fou
    pending_confirmation_set)."""
    rs = entry["rounded_score"]
    s = entry["set"]
    is_confirmation = pending == s
    if rs >= 4:
        return max(lower_bound, s), upper_bound, None
    if rs <= 2:
        return lower_bound, min(upper_bound, s), None
    # rs == 3
    if is_confirmation:
        return max(lower_bound, s - 1), min(upper_bound, s), None
    return lower_bound, upper_bound, s


def target_default_set(lower_bound: int, upper_bound: int) -> int:
    """Set par défaut à tester : le milieu (arrondi vers le bas, cf.
    l'exemple chiffré de l'algorithme — 7.5 -> 7) tant que la fenêtre est
    large, directement `upper_bound` (la frontière elle-même) dès qu'elle
    est déjà étroite (<=1) — cf. point 8 ("poser une question au set 8"
    quand lower=7/upper=8). `upper_bound` est une borne VIRTUELLE (peut
    valoir jusqu'à UPPER_BOUND_INIT=12, au-delà du dernier set réel) —
    on borne le résultat à [1, NUM_SETS] avant de le renvoyer, sinon un
    upper_bound resté à 12 (jamais contraint par un score <=2) provoque
    un IndexError au tirage de la question — cf. bug rapporté par le
    user en prod (crash de l'onboarding)."""
    if upper_bound - lower_bound <= 1:
        target = upper_bound
    else:
        target = (lower_bound + upper_bound) // 2
    return max(1, min(target, NUM_SETS))


def _modality_means(history: list) -> tuple:
    written = [e["score"] for e in history if e["kind"] == "ecrit"]
    oral = [e["score"] for e in history if e["kind"] == "oral"]
    written_mean = sum(written) / len(written) if written else None
    oral_mean = sum(oral) / len(oral) if oral else None
    return written_mean, oral_mean


def choose_next_question(question_number: int, lower_bound: int, upper_bound: int, pending, history: list):
    """Retourne (set_index, kind_voulu) pour la question `question_number`
    (1-indexé, celle qu'on s'apprête à tirer)."""
    if pending is not None:
        # Question de confirmation ciblée (point 5) : même set, modalité
        # opposée à la dernière réponse — prioritaire sur tout le reste.
        last_kind = history[-1]["kind"]
        return pending, ("oral" if last_kind == "ecrit" else "ecrit")

    if question_number <= 4:
        return target_default_set(lower_bound, upper_bound), FIXED_MODALITY[question_number]

    # Q5/Q6 : question de confirmation ciblée sur l'incertitude restante
    # (point 8) — teste la modalité la plus faible des deux moyennes.
    written_mean, oral_mean = _modality_means(history)
    if written_mean is not None and oral_mean is not None and written_mean != oral_mean:
        modality = "oral" if written_mean > oral_mean else "ecrit"
    else:
        modality = "oral" if history[-1]["kind"] == "ecrit" else "ecrit"
    return target_default_set(lower_bound, upper_bound), modality


def _confidence_conditions_met(question_number: int, lower_bound: int, upper_bound: int, pending, history: list) -> bool:
    """Les 6 conditions d'arrêt "propre" (point 7), cf. formulation exacte
    donnée par le user. Toutes doivent être vraies."""
    if question_number < MIN_QUESTIONS:
        return False
    written = [e for e in history if e["kind"] == "ecrit"]
    oral = [e for e in history if e["kind"] == "oral"]
    if len(written) < 2 or len(oral) < 2:
        return False
    if upper_bound - lower_bound > 1:
        return False
    written_mean, oral_mean = _modality_means(history)
    if abs(written_mean - oral_mean) >= MODALITY_GAP_THRESHOLD:
        return False
    if any(e["spread"] is not None and e["spread"] >= ORAL_SPREAD_THRESHOLD for e in oral):
        return False
    if pending is not None:
        return False
    return True


def should_stop(question_number: int, lower_bound: int, upper_bound: int, pending, history: list) -> bool:
    """Arrêt "propre" (conditions de confiance réunies) OU arrêt forcé au
    nombre maximal de questions (point 11 : 6 au maximum)."""
    if question_number >= ABSOLUTE_MAX_QUESTIONS:
        return True
    return _confidence_conditions_met(question_number, lower_bound, upper_bound, pending, history)


def niveau_from_target_set(target_set_index: int) -> str:
    """Niveau (dernière leçon considérée maîtrisée) tel que
    reference_lesson() pointera vers la PREMIÈRE leçon de
    `target_set_index` — le "point de départ" recommandé (point 10).
    DEFAULT_LEVEL si target_set_index <= 0 (avant le tout début du
    cours)."""
    if target_set_index <= 0:
        return DEFAULT_LEVEL
    sets = build_sets()
    clamped = min(target_set_index, len(sets))
    first_lesson = sets[clamped - 1][0]
    codes = all_lesson_codes_in_order()
    idx = codes.index(first_lesson)
    return codes[idx - 1] if idx > 0 else DEFAULT_LEVEL


def final_niveau(question_number: int, lower_bound: int, upper_bound: int, pending, history: list) -> str:
    """Niveau final : `upper_bound` directement si le positionnement est
    fiable (aucune marge systématique, cf. demande explicite du user —
    c'est le changement principal par rapport à l'algorithme classique),
    sinon `upper_bound - SAFETY_MARGIN_SETS` (confiance insuffisante en
    fin de test, ex: arrêt forcé au nombre max de questions alors qu'une
    condition échoue encore)."""
    confident = _confidence_conditions_met(question_number, lower_bound, upper_bound, pending, history)
    target = upper_bound if confident else max(1, upper_bound - SAFETY_MARGIN_SETS)
    return niveau_from_target_set(target)


def draw_for(set_index: int, modality: str) -> dict:
    """Tire une question au set/modalité voulus — réutilise draw_question
    (app.onboarding_exam), qui bascule silencieusement en écrit si l'oral
    demandé n'a pas de contenu à ce set (comportement existant inchangé).
    Le `kind` réellement tiré (pas forcément celui demandé) doit être
    utilisé pour l'historique/la notation, cf. l'appelant."""
    return draw_question(set_index, modality == "oral")
