import random

from app.data_loader import get_dataset
from app.lesson_order import all_lesson_codes_in_order

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
    """Construit un pack d'examen pour la leçon cible donnée (ex: '2.10').
    Les questions ne portent jamais sur le contenu de la leçon cible
    elle-même (pas encore débloquée) : 50% sur les 5 leçons qui la
    précèdent immédiatement, 50% sur toutes les leçons encore antérieures
    (depuis le chapitre 0, leçon 01). Renvoie None si le code ne correspond
    à aucune leçon connue."""
    chapitres = get_dataset("chapitre")
    phrases_data = get_dataset("phrase")

    chapter_num = code.split(".")[0]
    if chapter_num not in chapitres:
        return None
    lessons_in_chapter = chapitres[chapter_num]["lessons"]
    if code not in lessons_in_chapter:
        return None

    is_special = lessons_in_chapter[-1] == code
    total_questions = QUESTIONS_SPECIAL if is_special else QUESTIONS_REGULAR

    codes = all_lesson_codes_in_order()
    idx = codes.index(code)
    preceding = codes[:idx]
    recent = preceding[-5:]
    older = preceding[:-5] if len(preceding) > 5 else []

    n_recent = total_questions // 2
    n_older = total_questions - n_recent

    pool_recent = _pool_for_lessons(phrases_data, recent)
    pool_older = _pool_for_lessons(phrases_data, older)

    selected = _sample(pool_recent, n_recent)
    selected += _sample(pool_older, n_older)

    # Repli : si un des deux pools est insuffisant, on complète avec l'autre
    # (jamais avec la leçon cible elle-même ou une leçon postérieure). Pour
    # les tout premiers codes du livre, `preceding` peut être vide ou très
    # court : l'examen aura alors moins de questions que `total_questions`.
    combined = pool_recent + pool_older
    while len(selected) < total_questions and combined:
        selected += _sample(combined, total_questions - len(selected))

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
        "total_questions": len(questions),
        "pass_threshold": PASS_THRESHOLD,
        "questions": questions,
    }
