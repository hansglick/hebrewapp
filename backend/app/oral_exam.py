import random

from app.data_loader import get_dataset
from app.lesson_order import (
    all_lesson_codes_in_order,
    exam_type_for,
    recency_weights,
    sample_unique,
    weighted_sample_unique,
)
from app.text_questions import questions_for_text

QUESTIONS = {"rapide": 5, "long": 10, "tres_long": 20}
# Écrit long/très long uniquement : une part des questions orales est un
# "rapport" (compte-rendu écrit en français sur un texte entier) plutôt
# qu'une question orale standard — absent pour "rapide" (0 via .get).
RAPPORT_QUESTIONS = {"long": 2, "tres_long": 4}
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


def _texts_pool_for_lessons(lessons_data, texts_data, lesson_codes):
    """Liste dédupliquée des text_code des leçons données (items simples,
    pas des tuples) — sample_unique/weighted_sample_unique traitent alors
    directement le text_code comme sa propre clé d'unicité, avec la même
    forme de clé entre tirage uniforme et pondéré (condition nécessaire
    pour ne jamais tirer deux fois le même texte)."""
    pool = []
    seen = set()
    for lc in lesson_codes:
        lesson = lessons_data.get(lc)
        if not lesson:
            continue
        text_code = lesson.get("text") or ""
        if text_code and text_code in texts_data and text_code not in seen:
            seen.add(text_code)
            pool.append(text_code)
    return pool


def build_oral_exam(code: str, current_level: str):
    """Construit un pack d'examen oral pour la leçon cible `code`. Mêmes
    règles que `app.exam.build_exam` : le type d'examen dépend de `code`,
    mais le contenu vient toujours des leçons réellement débloquées
    (`current_level`). Renvoie None si `code` est inconnu."""
    codes = all_lesson_codes_in_order()
    if code not in codes or current_level not in codes:
        return None

    exam_type = exam_type_for(code)
    total_questions = QUESTIONS[exam_type]
    n_rapport = RAPPORT_QUESTIONS.get(exam_type, 0)
    n_standard = total_questions - n_rapport

    lessons_data = get_dataset("lesson")
    texts_data = get_dataset("text")
    accessible = codes[: codes.index(current_level) + 1]
    recent5 = accessible[-5:]
    weights_by_lesson = recency_weights(current_level)

    # Rapport : tiré en premier, sur un pool de textes entiers (pas de
    # text+question). Même équilibre dernière-leçon/pondéré que la
    # stratégie standard de cet exam_type, appliqué à ce sous-pool.
    # `used_texts` (par text_code seul) empêche ensuite le pool oral
    # standard de retirer un texte déjà utilisé en rapport, et
    # inversement — jamais le même enregistrement sous les deux formes
    # dans un même examen.
    used_texts = set()
    questions_rapport = []
    if n_rapport > 0:
        pool_recent5_texts = _texts_pool_for_lessons(lessons_data, texts_data, recent5)
        pool_weighted_texts = {}
        for lc in accessible:
            lesson = lessons_data.get(lc)
            if not lesson:
                continue
            text_code = lesson.get("text") or ""
            if text_code in texts_data:
                pool_weighted_texts[text_code] = weights_by_lesson[lc]

        text_used = set()
        if exam_type == "long":
            n_recent = n_rapport // 2
            selected_texts = sample_unique(pool_recent5_texts, n_recent, text_used)
            selected_texts += weighted_sample_unique(
                pool_weighted_texts, n_rapport - len(selected_texts), text_used
            )
        else:  # tres_long
            selected_texts = weighted_sample_unique(pool_weighted_texts, n_rapport, text_used)

        if len(selected_texts) < n_rapport:
            pool_all_texts = _texts_pool_for_lessons(lessons_data, texts_data, accessible)
            selected_texts += sample_unique(pool_all_texts, n_rapport - len(selected_texts), text_used)

        for text_code in selected_texts:
            used_texts.add(text_code)
            text = texts_data[text_code]
            questions_rapport.append(
                {
                    "type": "rapport",
                    "text_code": text_code,
                    "texte_hebrew": text["text"],
                    "voicepath": text["voicepath"],
                }
            )

    # Pool oral standard, inchangé sinon, mais exclut les textes déjà pris
    # par le rapport et ne vise plus que n_standard.
    pool_recent5 = [item for item in _pool_for_lessons(lessons_data, texts_data, recent5) if item[0] not in used_texts]

    pool_weighted = {}
    for lc in accessible:
        lesson = lessons_data.get(lc)
        if not lesson:
            continue
        text_code = lesson.get("text") or ""
        if text_code in used_texts:
            continue
        for tc, i in questions_for_text(texts_data, text_code):
            pool_weighted[(tc, i)] = weights_by_lesson[lc]

    used = set()

    if exam_type == "rapide":
        selected = sample_unique(pool_recent5, n_standard, used)
    elif exam_type == "long":
        n_recent = n_standard // 2
        selected = sample_unique(pool_recent5, n_recent, used)
        selected += weighted_sample_unique(pool_weighted, n_standard - len(selected), used)
    else:  # tres_long
        selected = weighted_sample_unique(pool_weighted, n_standard, used)

    # Complète avec le reste du pool accessible (toujours unique, toujours
    # hors used_texts) si les tirages ciblés n'ont pas suffi à atteindre le
    # total visé. Jamais de répétition : si même le pool accessible entier
    # est insuffisant, le nombre de questions est simplement réduit.
    if len(selected) < n_standard:
        pool_all = [
            item for item in _pool_for_lessons(lessons_data, texts_data, accessible) if item[0] not in used_texts
        ]
        selected += sample_unique(pool_all, n_standard - len(selected), used)

    questions_standard = []
    for text_code, q_index in selected:
        text = texts_data[text_code]
        question = text["questions"][q_index]
        questions_standard.append(
            {
                "type": "oral",
                "text_code": text_code,
                "question_index": q_index,
                "question_hebrew": question["hebrew"],
                "question_french": question["french"],
                "texte_hebrew": text["text"],
                "voicepath": text["voicepath"],
            }
        )

    questions = questions_rapport + questions_standard
    random.shuffle(questions)

    return {
        "code": code,
        "exam_type": exam_type,
        "total_questions": len(questions),
        "pass_threshold": PASS_THRESHOLD,
        "rating_threshold": RATING_THRESHOLD,
        "questions": questions,
    }
