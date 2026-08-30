import random

from app.data_loader import get_dataset
from app.difficulty import compute_combo_difficulties, weighted_pick
from app.lesson_order import recency_weights

N_OPTIONS = 8


def _levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)

    previous_row = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        current_row = [i] + [0] * len(b)
        for j, cb in enumerate(b, start=1):
            cost = 0 if ca == cb else 1
            current_row[j] = min(
                previous_row[j] + 1,
                current_row[j - 1] + 1,
                previous_row[j - 1] + cost,
            )
        previous_row = current_row
    return previous_row[len(b)]


def build_quizz_options(
    item_type: str, correct_key: str, correct_hebrew: str, current_level: str
) -> list[dict]:
    """Construit les 8 options d'un QCM (la bonne réponse + les 7 leurres du
    même type mot/verbe, classés par distance de Levenshtein croissante avec
    la bonne réponse), piochées dans tout le pool accessible (cumulatif)
    d'un niveau donné — réutilisée à la fois par build_quizz_question
    (révisions) et par exam.py (examens)."""
    lessons = get_dataset("lesson")
    lesson = lessons.get(current_level)
    correct_option = {"key": f"{item_type}:{correct_key}", "hebrew": correct_hebrew}
    if lesson is None:
        return [correct_option]

    dataset = get_dataset("word" if item_type == "mot" else "verbe")
    candidate_keys = lesson.get("global_words" if item_type == "mot" else "global_verbs", [])

    distractor_candidates = []
    for k in candidate_keys:
        if k == correct_key:
            continue
        candidate = dataset.get(k)
        if candidate is None:
            continue
        distractor_candidates.append((k, candidate["pure"]))

    distractor_candidates.sort(key=lambda kv: _levenshtein(kv[1], correct_hebrew))
    distractors = distractor_candidates[: N_OPTIONS - 1]

    options = [correct_option]
    options += [{"key": f"{item_type}:{k}", "hebrew": h} for k, h in distractors]
    random.shuffle(options)
    return options


def build_quizz_question(lesson_code: str, user_id: int) -> dict | None:
    """Tire un mot ou un verbe (pool fusionné Mot+Verbe de la leçon) pondéré
    50% difficulté / 50% récence — même mécanisme que random_mot/
    random_verbe, cf. app.difficulty.weighted_pick — puis construit un QCM
    de 8 options : la bonne réponse (forme hébraïque infinitive/simple, sans
    nikud) + les 7 leurres du même type (mot ou verbe) les plus proches par
    distance de Levenshtein, piochés dans le même pool débloqué (niveau
    actuel du user) que la question elle-même."""
    lessons = get_dataset("lesson")
    lesson = lessons.get(lesson_code)
    if lesson is None:
        return None

    words = get_dataset("word")
    verbes = get_dataset("verbe")
    global_words = lesson.get("global_words", [])
    global_verbs = lesson.get("global_verbs", [])

    weights_by_lesson = recency_weights(lesson_code)
    recency_pool = {}
    for w in global_words:
        word = words.get(w)
        if word is None:
            continue
        weight = weights_by_lesson.get(f"{word['chapter']}.{word['lesson']}")
        if weight is None:
            continue
        recency_pool[f"mot:{w}"] = weight
    for v in global_verbs:
        verbe = verbes.get(v)
        if verbe is None:
            continue
        weight = weights_by_lesson.get(f"{verbe['chapter']}.{verbe['lesson']}")
        if weight is None:
            continue
        recency_pool[f"verbe:{v}"] = weight

    difficulty_pool = {
        k: v for k, v in compute_combo_difficulties("quizz", user_id).items() if k in recency_pool
    }

    picked, draw_pool = weighted_pick(difficulty_pool, recency_pool)
    if picked is None:
        return None

    item_type, item_key = picked.split(":", 1)

    if item_type == "mot":
        item = words[item_key]
        prompt_french = item["french"]
    else:
        item = verbes[item_key]
        prompt_french = item["traduction"]

    correct_hebrew = item["pure"]
    options = build_quizz_options(item_type, item_key, correct_hebrew, lesson_code)

    return {
        "type": item_type,
        "key": picked,
        "french": prompt_french,
        "options": options,
        "chapter": item.get("chapter"),
        "lesson": item.get("lesson"),
        "pool": draw_pool,
    }
