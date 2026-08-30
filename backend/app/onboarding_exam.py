import random

from app.data_loader import get_dataset
from app.database import DEFAULT_LEVEL
from app.lesson_order import all_lesson_codes_in_order
from app.text_questions import questions_for_text

# 159 leçons -> 11 sets ordonnés (le 1er = premières leçons, le 11e = les
# dernières), de taille aussi égale que possible : les `remainder` premiers
# sets reçoivent une leçon de plus que les autres (convention standard de
# répartition d'un reliquat, type numpy.array_split).
NUM_SETS = 11
TOTAL_QUESTIONS = 7
NUM_ORAL = 2
# Set de départ de la 1re question : le médian des 11 sets.
STARTING_SET = (NUM_SETS + 1) // 2

# Seuils de notation (échelle 1-5 commune écrit/oral, cf. exam_session.py) :
# >=4 = bonne réponse (monte vers le set médian supérieur), <=2 = mauvaise
# réponse (descend vers le set médian inférieur), 3 = moyenne (tirage au
# hasard entre les deux). Pour la 7e question uniquement, la décision finale
# est binaire : >=3 = positif, <3 = négatif (cf. clarification user).
GOOD_THRESHOLD = 4
BAD_THRESHOLD = 2
FINAL_POSITIVE_THRESHOLD = 3


def score_from_result(kind: str, result: dict) -> int:
    """Note unique 1-5 à partir du résultat brut de /api/gemini/translation
    (déjà un score) ou /api/gemini/oral (3 notes, agrégées par une moyenne
    arrondie — même formule que gemini_eval.gemini_oral pour l'enregistrement
    de l'évaluation, dupliquée ici volontairement pour ne pas dépendre du
    router gemini_eval)."""
    if kind == "ecrit":
        return result["score"]
    ratings = [result["rating_completeness"], result["rating_hebrew"], result["rating_comprehension"]]
    return round(sum(ratings) / len(ratings))


def build_sets() -> list:
    codes = all_lesson_codes_in_order()
    n = len(codes)
    base, remainder = divmod(n, NUM_SETS)
    sets = []
    idx = 0
    for i in range(NUM_SETS):
        size = base + 1 if i < remainder else base
        sets.append(codes[idx: idx + size])
        idx += size
    return sets


def _median_index(size: int) -> int:
    """Index (0-indexé, dans une liste ascendante) de la "médiane basse" —
    élément du milieu pour une taille impaire, le plus petit des deux
    éléments centraux pour une taille paire (convention confirmée avec le
    user)."""
    return (size - 1) // 2


def neighbors(current_set: int) -> tuple:
    """(médian de la partition inférieure, médian de la partition
    supérieure) adjacentes à `current_set` (1-indexé, 1..NUM_SETS). Les deux
    partitions sont forcées à la même taille = min(sets en dessous, sets au
    dessus), en ne prenant que les sets immédiatement adjacents à
    `current_set` de ce côté (cf. exemple du user : depuis le set 9, la
    partition inférieure fixée = sets 7 et 8, pas 1 à 8).

    Cas limite : depuis une extrémité (set 1 ou NUM_SETS), il n'existe aucun
    set de ce côté (pool = 0) — on reste alors sur `current_set` plutôt que
    de planter sur une liste vide."""
    pool = min(current_set - 1, NUM_SETS - current_set)
    if pool == 0:
        return current_set, current_set
    lower_range = list(range(current_set - pool, current_set))
    upper_range = list(range(current_set + 1, current_set + pool + 1))
    lower_median = lower_range[_median_index(len(lower_range))]
    upper_median = upper_range[_median_index(len(upper_range))]
    return lower_median, upper_median


def next_set(current_set: int, score: int) -> int:
    lower_med, upper_med = neighbors(current_set)
    if score >= GOOD_THRESHOLD:
        return upper_med
    if score <= BAD_THRESHOLD:
        return lower_med
    return random.choice([lower_med, upper_med])


def final_set(current_set: int, score: int) -> int:
    """Décision finale après la 7e question : binaire (positif >= 3 -> set
    médian supérieur, négatif < 3 -> set médian inférieur), cf.
    clarification user (pas de 3e catégorie "moyen" à ce stade)."""
    lower_med, upper_med = neighbors(current_set)
    return upper_med if score >= FINAL_POSITIVE_THRESHOLD else lower_med


def niveau_from_final_set(final_set_index: int) -> str:
    """Niveau à attribuer au user à partir du set final déterminé par
    l'examen d'entrée : la leçon juste avant la première leçon du set
    PRÉCÉDENT le set final (marge de sécurité d'un set entier), ou
    DEFAULT_LEVEL si ce set précédent n'existe pas (final_set <= 1)."""
    if final_set_index <= 1:
        return DEFAULT_LEVEL
    sets = build_sets()
    previous_set = final_set_index - 1
    first_lesson = sets[previous_set - 1][0]
    codes = all_lesson_codes_in_order()
    idx = codes.index(first_lesson)
    return codes[idx - 1] if idx > 0 else DEFAULT_LEVEL


def _pick_lesson_with_content(lesson_codes: list, predicate) -> str | None:
    candidates = [lc for lc in lesson_codes if predicate(lc)]
    if not candidates:
        return None
    return random.choice(candidates)


def draw_written_question(set_index: int) -> dict | None:
    sets = build_sets()
    lesson_codes = sets[set_index - 1]
    phrases_data = get_dataset("phrase")
    lc = _pick_lesson_with_content(lesson_codes, lambda c: len(phrases_data.get(c, [])) > 0)
    if lc is None:
        return None
    pool = phrases_data[lc]
    position = random.randrange(len(pool))
    phrase = pool[position]
    return {
        "kind": "ecrit",
        "lesson_code": lc,
        "position": position,
        "direction": "hebreu",
        "hebrew": phrase["hebrew"],
        "french": phrase["french"],
    }


def draw_oral_question(set_index: int) -> dict | None:
    sets = build_sets()
    lesson_codes = sets[set_index - 1]
    lessons_data = get_dataset("lesson")
    texts_data = get_dataset("text")

    def has_oral(lc):
        lesson = lessons_data.get(lc)
        if not lesson:
            return False
        return bool(questions_for_text(texts_data, lesson.get("text") or ""))

    lc = _pick_lesson_with_content(lesson_codes, has_oral)
    if lc is None:
        return None
    text_code = lessons_data[lc]["text"]
    pairs = questions_for_text(texts_data, text_code)
    _, q_index = random.choice(pairs)
    text = texts_data[text_code]
    question = text["questions"][q_index]
    return {
        "kind": "oral",
        "lesson_code": lc,
        "text_code": text_code,
        "question_index": q_index,
        "question_hebrew": question["hebrew"],
        "question_french": question["french"],
        "texte_hebrew": text["text"],
        "voicepath": text["voicepath"],
    }


def pick_oral_slots() -> list:
    """Numéros de question (parmi 1..TOTAL_QUESTIONS) désignés oraux, tirés
    une fois pour toutes au début de la tentative — la désignation reste
    fixe même si, le moment venu, le set tiré n'a finalement aucun contenu
    oral disponible (fallback silencieux vers l'écrit, cf. draw_question)."""
    return random.sample(range(1, TOTAL_QUESTIONS + 1), NUM_ORAL)


def draw_question(set_index: int, wants_oral: bool) -> dict:
    """Tire une question dans `set_index`. Si `wants_oral` et qu'aucune leçon
    du set n'a de contenu oral, bascule silencieusement en écrit (fallback
    confirmé avec le user) — la question renvoyée porte alors kind="ecrit"
    même si ce numéro de question était initialement désigné oral."""
    if wants_oral:
        question = draw_oral_question(set_index)
        if question is not None:
            return question
    return draw_written_question(set_index)
