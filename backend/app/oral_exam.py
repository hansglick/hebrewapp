import random

from app.data_loader import get_dataset
from app.lesson_order import all_lesson_codes_in_order
from app.text_questions import questions_for_text

QUESTIONS_REGULAR = 10
QUESTIONS_SPECIAL = 20
PASS_THRESHOLD = 0.7
RATING_THRESHOLD = 4


def _pool_for_lessons(lessons_data, texts_data, lesson_codes):
    pool = []
    for lc in lesson_codes:
        lesson = lessons_data.get(lc)
        if not lesson:
            continue
        text_code = lesson.get("text") or ""
        pool.extend(questions_for_text(texts_data, text_code))
    return pool


def _sample(pool, n):
    if not pool or n <= 0:
        return []
    if len(pool) >= n:
        return random.sample(pool, n)
    return random.choices(pool, k=n)


def build_oral_exam(code: str):
    """Construit un pack d'examen oral pour la leçon cible donnée. Mêmes
    règles de tirage que l'examen écrit (voir app.exam.build_exam) : jamais
    de question sur le texte de la leçon cible elle-même, 50% sur les 5
    leçons qui la précèdent immédiatement, 50% sur toutes les leçons encore
    antérieures. Renvoie None si le code ne correspond à aucune leçon
    connue."""
    chapitres = get_dataset("chapitre")
    lessons_data = get_dataset("lesson")
    texts_data = get_dataset("text")

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

    pool_recent = _pool_for_lessons(lessons_data, texts_data, recent)
    pool_older = _pool_for_lessons(lessons_data, texts_data, older)

    selected = _sample(pool_recent, n_recent)
    selected += _sample(pool_older, n_older)

    combined = pool_recent + pool_older
    while len(selected) < total_questions and combined:
        selected += _sample(combined, total_questions - len(selected))

    random.shuffle(selected)

    questions = []
    for text_code, q_index in selected:
        text = texts_data[text_code]
        question = text["questions"][q_index]
        questions.append(
            {
                "text_code": text_code,
                "question_index": q_index,
                "question_hebrew": question["hebrew"],
                "question_french": question["french"],
                "texte_hebrew": text["text"],
                "voicepath": text["voicepath"],
            }
        )

    return {
        "code": code,
        "is_special": is_special,
        "total_questions": len(questions),
        "pass_threshold": PASS_THRESHOLD,
        "rating_threshold": RATING_THRESHOLD,
        "questions": questions,
    }
