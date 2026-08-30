import random

from app.data_loader import get_dataset
from app.lesson_order import (
    all_lesson_codes_in_order,
    exam_type_for,
    recency_weights,
    sample_unique,
    weighted_sample_unique,
)
from app.quizz import build_quizz_options

QUESTIONS = {"rapide": 15, "long": 25, "tres_long": 100}
# Écrit "rapide" uniquement : mix traduction/quizz vocabulaire au lieu de
# 100% traduction — cf. build_exam.
N_TRADUCTION_RAPIDE = 9
N_QUIZZ_RAPIDE = 6
PASS_THRESHOLD = 0.7
# Minuteur (en secondes) pour les formats "long"/"très long" — pas de
# minuteur pour "rapide" (absent du dict).
TIMER_SECONDS = {"long": 35 * 60, "tres_long": 200 * 60}


def _pool_for_lessons(phrases_data, lesson_codes):
    pool = []
    for lc in lesson_codes:
        for i, phrase in enumerate(phrases_data.get(lc, [])):
            pool.append((lc, i, phrase))
    return pool


def _vocab_pool_for_lessons(lessons_data, words_data, verbes_data, lesson_codes):
    """Pool fusionné mots+verbes des leçons données (leurs propres listes
    "words"/"verbs", pas les global_* cumulatifs — même logique que
    _pool_for_lessons pour les phrases). Chaque item est un tuple
    ("mot"/"verbe", clé, objet) : sample_unique s'appuie sur les 2 premiers
    éléments comme clé d'unicité, donc réutilisable tel quel."""
    pool = []
    for lc in lesson_codes:
        lesson = lessons_data.get(lc)
        if not lesson:
            continue
        for w in lesson.get("words", []):
            word = words_data.get(w)
            if word is not None:
                pool.append(("mot", w, word))
        for v in lesson.get("verbs", []):
            verbe = verbes_data.get(v)
            if verbe is not None:
                pool.append(("verbe", v, verbe))
    return pool


def _traduction_question(lc, pos, phrase):
    return {
        "type": "traduction",
        "lesson_code": lc,
        "position": pos,
        "hebrew": phrase["hebrew"],
        "french": phrase["french"],
    }


def _quizz_question(item_type, key, item, current_level):
    correct_hebrew = item["pure"]
    prompt_french = item["french"] if item_type == "mot" else item["traduction"]
    return {
        "type": "quizz",
        "key": f"{item_type}:{key}",
        "french": prompt_french,
        "options": build_quizz_options(item_type, key, correct_hebrew, current_level),
    }


def build_exam(code: str, current_level: str):
    """Construit un pack d'examen écrit pour la leçon cible `code`. Le type
    d'examen (rapide/long/très long) dépend du numéro de `code` lui-même,
    mais le contenu des questions est toujours tiré parmi les leçons
    réellement débloquées par le user (`current_level`), pas parmi les
    leçons précédant `code` — `code` peut être bien plus loin que
    `current_level` (scénario "sauter une classe"). Renvoie None si `code`
    est inconnu."""
    codes = all_lesson_codes_in_order()
    if code not in codes or current_level not in codes:
        return None

    exam_type = exam_type_for(code)
    total_questions = QUESTIONS[exam_type]

    phrases_data = get_dataset("phrase")
    accessible = codes[: codes.index(current_level) + 1]
    most_recent = accessible[-1:]
    recent5 = accessible[-5:]

    pool_most_recent = _pool_for_lessons(phrases_data, most_recent)
    pool_recent5 = _pool_for_lessons(phrases_data, recent5)

    weights_by_lesson = recency_weights(current_level)
    pool_weighted = {
        (lc, i): weights_by_lesson[lc]
        for lc in accessible
        for i in range(len(phrases_data.get(lc, [])))
    }

    used = set()

    if exam_type == "rapide":
        # Écrit rapide uniquement : 12 traductions + 8 quizz vocabulaire,
        # chacun tiré indépendamment selon la même règle 50% dernière leçon
        # seule / 50% 5 dernières leçons (jamais de pondération par
        # difficulté ici, comme pour le reste des examens).
        lessons_data = get_dataset("lesson")
        words_data = get_dataset("word")
        verbes_data = get_dataset("verbe")

        selected_phrases = sample_unique(pool_most_recent, N_TRADUCTION_RAPIDE // 2, used)
        selected_phrases += sample_unique(
            pool_recent5, N_TRADUCTION_RAPIDE - len(selected_phrases), used
        )
        if len(selected_phrases) < N_TRADUCTION_RAPIDE:
            pool_all_phrases = _pool_for_lessons(phrases_data, accessible)
            selected_phrases += sample_unique(
                pool_all_phrases, N_TRADUCTION_RAPIDE - len(selected_phrases), used
            )

        vocab_most_recent = _vocab_pool_for_lessons(lessons_data, words_data, verbes_data, most_recent)
        vocab_recent5 = _vocab_pool_for_lessons(lessons_data, words_data, verbes_data, recent5)
        selected_vocab = sample_unique(vocab_most_recent, N_QUIZZ_RAPIDE // 2, used)
        selected_vocab += sample_unique(vocab_recent5, N_QUIZZ_RAPIDE - len(selected_vocab), used)
        if len(selected_vocab) < N_QUIZZ_RAPIDE:
            vocab_all = _vocab_pool_for_lessons(lessons_data, words_data, verbes_data, accessible)
            selected_vocab += sample_unique(vocab_all, N_QUIZZ_RAPIDE - len(selected_vocab), used)

        questions = [_traduction_question(lc, pos, phrase) for lc, pos, phrase in selected_phrases]
        questions += [
            _quizz_question(item_type, key, item, current_level)
            for item_type, key, item in selected_vocab
        ]
        random.shuffle(questions)

        return {
            "code": code,
            "exam_type": exam_type,
            "total_questions": len(questions),
            "pass_threshold": PASS_THRESHOLD,
            "questions": questions,
        }

    if exam_type == "long":
        n_recent = total_questions // 2
        selected = sample_unique(pool_recent5, n_recent, used)
        remaining = total_questions - len(selected)
        selected += [
            (lc, i, phrases_data[lc][i])
            for lc, i in weighted_sample_unique(pool_weighted, remaining, used)
        ]
    else:  # tres_long
        selected = [
            (lc, i, phrases_data[lc][i])
            for lc, i in weighted_sample_unique(pool_weighted, total_questions, used)
        ]

    # Complète avec le reste du pool accessible (toujours unique) si les
    # tirages ciblés n'ont pas suffi à atteindre le total visé. Jamais de
    # répétition : si même le pool accessible entier est insuffisant, le
    # nombre de questions est simplement réduit (cf. `total_questions` du
    # retour, basé sur `len(questions)` et non sur la cible nominale).
    if len(selected) < total_questions:
        pool_all = _pool_for_lessons(phrases_data, accessible)
        selected += sample_unique(pool_all, total_questions - len(selected), used)

    random.shuffle(selected)

    questions = [_traduction_question(lc, pos, phrase) for lc, pos, phrase in selected]

    return {
        "code": code,
        "exam_type": exam_type,
        "total_questions": len(questions),
        "pass_threshold": PASS_THRESHOLD,
        "questions": questions,
    }
