import random

from app.data_loader import get_dataset
from app.database import get_connection
from app.difficulty import _is_negative, define_difficulty_score
from app.lesson_order import all_lesson_codes_in_order, level_score, sample_unique
from app.quizz import build_quizz_options
from app.stats import TAB_OBJECT_TYPES
from app.text_questions import questions_for_text

N_QUESTIONS = 10
PASS_THRESHOLD = 0.9
TIMER_SECONDS = 10 * 60
RATING_THRESHOLD = 4


def _last_level_up_at(conn, user_id: int) -> str | None:
    """Horodatage de la dernière VRAIE montée de niveau (écrit ET oral
    réussis sur un même code, faisant progresser dans le cours) — distinct
    d'une simple insertion dans level_history, qui trace aussi les
    redescentes (repasse ratée d'un examen déjà certifié). Dérivé en
    comparant chaque entrée à la précédente plutôt que stocké, faute d'un
    champ "sens" sur level_history."""
    rows = conn.execute(
        "SELECT level, reached_at FROM level_history WHERE user_id = ? ORDER BY reached_at ASC, id ASC",
        (user_id,),
    ).fetchall()
    last_up = None
    previous_score = None
    for row in rows:
        score = level_score(row["level"])
        if score is None:
            continue
        # `previous_score is None` couvre à la fois le tout premier niveau
        # jamais atteint et le cas où toutes les entrées précédentes étaient
        # le sentinel de bootstrap (score None, ex: DEFAULT_LEVEL) : dans les
        # deux cas, atteindre un premier niveau valide compte comme une
        # montée.
        if previous_score is None or score > previous_score:
            last_up = row["reached_at"]
        previous_score = score
    return last_up


def is_unlocked(conn, user_id: int) -> bool:
    """Déverrouillé ⟺ la dernière VRAIE montée de niveau (écrit ET oral
    réussis, cf. _last_level_up_at) est plus récente que la dernière
    tentative de hard exam (ou qu'aucune tentative de hard exam n'existe
    encore). Pas de flag stocké : monter de niveau déverrouille, tenter le
    hard exam (réussite ou échec) reverrouille aussitôt. Réussir un seul
    format (écrit ou oral) sans faire progresser le niveau ne suffit pas."""
    last_level_up = _last_level_up_at(conn, user_id)
    if last_level_up is None:
        return False
    last_hard = conn.execute(
        "SELECT MAX(attempted_at) AS t FROM hard_exam_attempts WHERE user_id = ?",
        (user_id,),
    ).fetchone()["t"]
    return last_hard is None or last_level_up > last_hard


def _evaluated_difficulties(tab: str, user_id: int) -> dict:
    """{object_key: difficulty} pour tous les combos évalués au moins une
    fois d'un onglet Statistiques donné — même score que app.stats/
    app.difficulty, recalculé ici (pas de dépendance à build_stats, qui
    tronque à TOP_N=25 et ne renvoie que des lignes d'affichage)."""
    conn = get_connection()
    try:
        object_types = TAB_OBJECT_TYPES[tab]
        placeholders = ",".join("?" * len(object_types))
        rows = conn.execute(
            f"""
            SELECT object_key, success, score, created_at
            FROM evaluations
            WHERE user_id = ? AND object_type IN ({placeholders})
            ORDER BY object_key, created_at DESC, id DESC
            """,
            (user_id, *object_types),
        ).fetchall()
    finally:
        conn.close()

    by_key = {}
    for row in rows:
        by_key.setdefault(row["object_key"], []).append(row)

    difficulties = {}
    for key, evals in by_key.items():
        last5 = list(reversed(evals[:5]))
        bool_list = [not _is_negative(ev["success"], ev["score"]) for ev in last5]
        difficulties[key] = define_difficulty_score(bool_list)
    return difficulties


def _verbe_candidates(user_id: int) -> list:
    verbes = get_dataset("verbe")
    out = []
    for key, difficulty in _evaluated_difficulties("verbe", user_id).items():
        parts = key.split("|")
        if len(parts) != 3:
            continue
        verbe_key, temps, personne_key = parts
        verbe = verbes.get(verbe_key)
        if verbe is None:
            continue
        conj = verbe.get("conjugaisons", {}).get(temps, {}).get(personne_key)
        if conj is None:
            continue
        out.append((
            "verbe",
            key,
            difficulty,
            {
                "type": "verbe",
                "key": key,
                "verbe": verbe["pure"],
                "traduction": verbe["traduction"],
                "temps": temps,
                "personne": conj["personne"],
                "conjugaison": conj["conjugaison"],
            },
        ))
    return out


def _traduction_candidates(direction: str, tab: str, user_id: int) -> list:
    phrases = get_dataset("phrase")
    out = []
    for key, difficulty in _evaluated_difficulties(tab, user_id).items():
        parts = key.split("|")
        if len(parts) != 3:
            continue
        lesson_code, position_str, key_direction = parts
        if key_direction != direction:
            continue
        pool = phrases.get(lesson_code, [])
        position = int(position_str)
        if position < 0 or position >= len(pool):
            continue
        phrase = pool[position]
        out.append((
            "traduction",
            key,
            difficulty,
            {
                "type": "traduction",
                "direction": direction,
                "lesson_code": lesson_code,
                "position": position,
                "hebrew": phrase["hebrew"],
                "french": phrase["french"],
            },
        ))
    return out


def _quizz_candidates(current_level: str, user_id: int) -> list:
    words = get_dataset("word")
    verbes = get_dataset("verbe")
    out = []
    for key, difficulty in _evaluated_difficulties("quizz", user_id).items():
        item_type, _, item_key = key.partition(":")
        item = (words if item_type == "mot" else verbes).get(item_key)
        if item is None:
            continue
        correct_hebrew = item["pure"]
        prompt_french = item["french"] if item_type == "mot" else item["traduction"]
        options = build_quizz_options(item_type, item_key, correct_hebrew, current_level)
        out.append((
            "quizz",
            key,
            difficulty,
            {"type": "quizz", "key": key, "french": prompt_french, "options": options},
        ))
    return out


def _oral_candidates(user_id: int) -> list:
    texts = get_dataset("text")
    out = []
    for key, difficulty in _evaluated_difficulties("oral", user_id).items():
        text_code, _, index_str = key.rpartition("|")
        text = texts.get(text_code)
        if text is None:
            continue
        index = int(index_str)
        questions = text.get("questions") or []
        if index < 0 or index >= len(questions):
            continue
        question = questions[index]
        out.append((
            "oral",
            key,
            difficulty,
            {
                "type": "oral",
                "text_code": text_code,
                "question_index": index,
                "question_hebrew": question["hebrew"],
                "question_french": question["french"],
                "texte_hebrew": text["text"],
                "voicepath": text["voicepath"],
            },
        ))
    return out


def _all_evaluated_candidates(current_level: str, user_id: int) -> list:
    # "mot" est exclu : ce type n'est proposé qu'en auto-évaluation ailleurs
    # dans l'app (aucune vérification objective), jugé trop peu fiable pour
    # un hard exam au seuil de 90%. "verbe" reste inclus mais noté par
    # comparaison écrite plutôt qu'auto-évaluation, cf. _note_and_success.
    return (
        _verbe_candidates(user_id)
        + _traduction_candidates("francais", "traduction.fr", user_id)
        + _traduction_candidates("hebreu", "traduction.he", user_id)
        + _quizz_candidates(current_level, user_id)
        + _oral_candidates(user_id)
    )


def _pick_top(candidates: list, n: int) -> list:
    """Les `n` items de plus haute difficulté. Les items strictement
    au-dessus du seuil de la n-ième place sont toujours gardés ; en cas
    d'égalité à ce seuil (plus de `n` candidats qualifiés), le reste des
    places est tiré au hasard parmi les ex-aequo."""
    if len(candidates) <= n:
        return list(candidates)
    ordered = sorted(candidates, key=lambda c: c[2], reverse=True)
    cutoff = ordered[n - 1][2]
    above = [c for c in ordered if c[2] > cutoff]
    tied = [c for c in ordered if c[2] == cutoff]
    return above + random.sample(tied, n - len(above))


def _fallback_pool(current_level: str) -> list:
    """Pool de secours (tous types mélangés) parmi les leçons accessibles
    au niveau actuel, pour compléter le tirage quand moins de N_QUESTIONS
    items ont déjà été évalués — même principe que build_exam/
    build_quizz_question, mais mots/verbes/traduction/oral/quizz combinés."""
    codes = all_lesson_codes_in_order()
    if current_level not in codes:
        return []
    accessible = codes[: codes.index(current_level) + 1]

    lessons_data = get_dataset("lesson")
    words_data = get_dataset("word")
    verbes_data = get_dataset("verbe")
    phrases_data = get_dataset("phrase")
    texts_data = get_dataset("text")

    pool = []
    for lc in accessible:
        lesson = lessons_data.get(lc)
        if not lesson:
            continue

        for w in lesson.get("words", []):
            word = words_data.get(w)
            if word is None:
                continue
            # Pas d'entrée "mot" (flashcard auto-évaluée) : exclue du hard
            # exam, cf. _all_evaluated_candidates. Le quizz basé sur ce même
            # mot reste proposé (déjà noté objectivement, sans auto-éval).
            pool.append((
                "quizz",
                f"mot:{w}",
                0.0,
                {
                    "type": "quizz",
                    "key": f"mot:{w}",
                    "french": word["french"],
                    "options": build_quizz_options("mot", w, word["pure"], current_level),
                },
            ))

        for v in lesson.get("verbs", []):
            verbe = verbes_data.get(v)
            if verbe is None:
                continue
            for temps, personnes in verbe.get("conjugaisons", {}).items():
                for personne_key, conj in personnes.items():
                    key = f"{v}|{temps}|{personne_key}"
                    pool.append((
                        "verbe",
                        key,
                        0.0,
                        {
                            "type": "verbe",
                            "key": key,
                            "verbe": verbe["pure"],
                            "traduction": verbe["traduction"],
                            "temps": temps,
                            "personne": conj["personne"],
                            "conjugaison": conj["conjugaison"],
                        },
                    ))
            pool.append((
                "quizz",
                f"verbe:{v}",
                0.0,
                {
                    "type": "quizz",
                    "key": f"verbe:{v}",
                    "french": verbe["traduction"],
                    "options": build_quizz_options("verbe", v, verbe["pure"], current_level),
                },
            ))

        for i, phrase in enumerate(phrases_data.get(lc, [])):
            for direction in ("francais", "hebreu"):
                key = f"{lc}|{i}|{direction}"
                pool.append((
                    "traduction",
                    key,
                    0.0,
                    {
                        "type": "traduction",
                        "direction": direction,
                        "lesson_code": lc,
                        "position": i,
                        "hebrew": phrase["hebrew"],
                        "french": phrase["french"],
                    },
                ))

        text_code = lesson.get("text") or ""
        text = texts_data.get(text_code)
        if text:
            for tc, idx in questions_for_text(texts_data, text_code):
                q = text["questions"][idx]
                key = f"{tc}|{idx}"
                pool.append((
                    "oral",
                    key,
                    0.0,
                    {
                        "type": "oral",
                        "text_code": tc,
                        "question_index": idx,
                        "question_hebrew": q["hebrew"],
                        "question_french": q["french"],
                        "texte_hebrew": text["text"],
                        "voicepath": text["voicepath"],
                    },
                ))

    return pool


def build_hard_exam(conn, user_id: int, current_level: str) -> dict:
    evaluated = _all_evaluated_candidates(current_level, user_id)
    selected = _pick_top(evaluated, N_QUESTIONS)

    if len(selected) < N_QUESTIONS:
        used = {(c[0], c[1]) for c in selected}
        fallback_pool = [c for c in _fallback_pool(current_level) if (c[0], c[1]) not in used]
        remaining = N_QUESTIONS - len(selected)
        selected += sample_unique(fallback_pool, remaining, set())

    questions = [c[3] for c in selected]
    random.shuffle(questions)

    return {"total_questions": len(questions), "pass_threshold": PASS_THRESHOLD, "questions": questions}


def _note_and_success(question: dict, answer: dict) -> tuple:
    """Note sur 5 et réussite pour une réponse donnée, selon le type de la
    question — mêmes règles que celles déjà utilisées ailleurs dans l'app
    pour chaque type (quizz validé serveur, traduction/oral notés par
    Gemini, cf. app.exam_session._note_and_success pour les types qu'elle
    partage). "verbe" est noté par comparaison stricte de la chaîne saisie
    par le user avec la conjugaison attendue — pas d'auto-évaluation ici,
    contrairement aux révisions."""
    qtype = question.get("type")
    if qtype == "verbe":
        submitted = (answer.get("submitted") or "").strip()
        expected = (question.get("conjugaison") or "").strip()
        success = submitted == expected
        return (5.0 if success else 1.0), success
    if qtype in ("quizz", "traduction"):
        note = answer["score"]
        return note, note >= RATING_THRESHOLD
    ratings = [answer["rating_completeness"], answer["rating_hebrew"], answer["rating_comprehension"]]
    note = sum(ratings) / len(ratings)
    return note, all(r >= RATING_THRESHOLD for r in ratings)
