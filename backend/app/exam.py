import random

from app.data_loader import get_dataset

QUESTIONS_REGULAR = 20
QUESTIONS_SPECIAL = 50
PASS_THRESHOLD = 0.7  # 14/20 pour un examen normal, 70% pour l'examen spécial


def _pool_for_lessons(phrases_data, lesson_codes):
    pool = []
    for lc in lesson_codes:
        for i, phrase in enumerate(phrases_data.get(lc, [])):
            pool.append((lc, i, phrase))
    return pool


def _sample(pool, n):
    if not pool or n <= 0:
        return []
    if len(pool) >= n:
        return random.sample(pool, n)
    return random.choices(pool, k=n)


def build_exam(code: str):
    """Construit un pack d'examen pour le code de leçon donné (ex: '2.10').
    Renvoie None si le code ne correspond à aucune leçon connue."""
    chapitres = get_dataset("chapitre")
    phrases_data = get_dataset("phrase")

    chapter_num = code.split(".")[0]
    if chapter_num not in chapitres:
        return None
    lessons_in_chapter = chapitres[chapter_num]["lessons"]
    if code not in lessons_in_chapter:
        return None

    is_special = lessons_in_chapter[-1] == code

    if is_special:
        total_questions = QUESTIONS_SPECIAL
        n = len(lessons_in_chapter)
        cut = n - n // 4
        last_quarter = lessons_in_chapter[cut:]
        first_part = lessons_in_chapter[:cut]

        selected = _sample(_pool_for_lessons(phrases_data, last_quarter), 25)
        selected += _sample(_pool_for_lessons(phrases_data, first_part), 25)
    else:
        total_questions = QUESTIONS_REGULAR
        idx = lessons_in_chapter.index(code)

        # Si l'examen porte sur une des premières leçons du chapitre, on va
        # chercher les leçons "précédentes" manquantes dans le chapitre d'avant.
        reference = list(lessons_in_chapter)
        if idx < 2 and int(chapter_num) > 0:
            prev_chapter = str(int(chapter_num) - 1)
            if prev_chapter in chapitres:
                reference = chapitres[prev_chapter]["lessons"] + reference
                idx = reference.index(code)

        own_lesson = [code]
        prev_lesson = [reference[idx - 1]] if idx >= 1 else []
        avant_dernier = [reference[idx - 2]] if idx >= 2 else []
        anterior = reference[: idx - 2] if idx >= 2 else []

        pool_own = _pool_for_lessons(phrases_data, own_lesson)

        selected = _sample(pool_own, 10)
        selected += _sample(_pool_for_lessons(phrases_data, prev_lesson), 2)
        selected += _sample(_pool_for_lessons(phrases_data, avant_dernier), 2)
        selected += _sample(_pool_for_lessons(phrases_data, anterior), 6)

        # Repli : un bucket vide (leçon sans phrase) est compensé par la leçon associée.
        while len(selected) < total_questions and pool_own:
            selected += _sample(pool_own, total_questions - len(selected))

    # Dernier repli : compléter avec tout le pool du chapitre si besoin.
    if len(selected) < total_questions:
        fallback_pool = _pool_for_lessons(phrases_data, lessons_in_chapter)
        while len(selected) < total_questions and fallback_pool:
            selected += _sample(fallback_pool, total_questions - len(selected))

    random.shuffle(selected)

    questions = [
        {
            "lesson_code": lc,
            "position": pos,
            "hebrew": phrase["hebrew"],
            "french": phrase["french"],
        }
        for lc, pos, phrase in selected
    ]

    return {
        "code": code,
        "is_special": is_special,
        "total_questions": total_questions,
        "pass_threshold": PASS_THRESHOLD,
        "questions": questions,
    }
