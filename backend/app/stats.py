from collections import defaultdict

from app.data_loader import get_dataset
from app.database import get_connection
from app.difficulty import _is_negative, define_difficulty_score
from app.lesson_order import recency_weights, reference_lesson

# Chaque onglet Statistiques peut recouvrir plusieurs object_type (ex: la
# traduction est notée soit en auto-éval soit par Gemini, mais représente le
# même objet pédagogique — leur historique doit être fusionné).
# La traduction est scindée en deux onglets par sens (français/hébreu, cf.
# le sélecteur de révision) plutôt qu'un classement mélangeant les deux —
# les deux onglets partagent les mêmes object_type, seul le sens (embarqué
# dans object_key) diffère, filtré dans _build_traduction_rows.
TAB_OBJECT_TYPES = {
    "mot": ["mot"],
    "verbe": ["verbe"],
    "traduction.fr": ["phrase_auto", "phrase_gemini"],
    "traduction.he": ["phrase_auto", "phrase_gemini"],
    "quizz": ["quizz"],
    "oral": ["oral"],
}


def _fetch_evaluations_by_key(object_types: list[str], user_id: int) -> dict[str, list]:
    conn = get_connection()
    try:
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

    by_key = defaultdict(list)
    for row in rows:
        by_key[row["object_key"]].append(row)
    return by_key


def _score_and_last5(evals: list) -> tuple[float, list[bool]]:
    """Retourne (score de difficulté, 5 dernières évaluations) pour un combo
    — le même score, calculé par define_difficulty_score, que celui utilisé
    pour pondérer le tirage aléatoire (cf. difficulty.py)."""
    # `evals` est du plus récent au plus ancien (ordre de la requête SQL) ;
    # on inverse pour repasser à l'ordre attendu (ancien -> récent), à la
    # fois pour le calcul du score et pour l'affichage des pastilles.
    last5 = list(reversed(evals[:5]))
    last_evaluations = [not _is_negative(ev["success"], ev["score"]) for ev in last5]
    difficulty = define_difficulty_score(last_evaluations)
    return difficulty, last_evaluations


def _split_lesson_code(lesson_code: str) -> tuple[str, str]:
    chapter, _, lesson = lesson_code.partition(".")
    return chapter, lesson


def _build_mot_rows(by_key: dict) -> list[dict]:
    words = get_dataset("word")
    rows = []
    for key, evals in by_key.items():
        word_key, _, langue = key.rpartition("|")
        word = words.get(word_key)
        if word is None:
            continue
        # Seul le mot proposé (le côté que l'user devait traduire) est
        # affiché — pas sa traduction, qui serait la réponse attendue.
        proposed = word["original"] if langue == "hebreu" else word["french"]
        difficulty, last_evaluations = _score_and_last5(evals)
        rows.append(
            {
                "object_key": key,
                "content": proposed,
                "chapter": word.get("chapter"),
                "lesson": word.get("lesson"),
                "difficulty": difficulty,
                "last_evaluations": last_evaluations,
            }
        )
    return rows


TEMPS_LABELS = {"past": "passé", "present": "présent", "futur": "futur"}


def _build_verbe_rows(by_key: dict) -> list[dict]:
    verbes = get_dataset("verbe")
    rows = []
    for key, evals in by_key.items():
        verbe_key, temps, personne_key = key.split("|")
        verbe = verbes.get(verbe_key)
        if verbe is None:
            continue
        conj = verbe.get("conjugaisons", {}).get(temps, {}).get(personne_key)
        if conj is None:
            continue
        difficulty, last_evaluations = _score_and_last5(evals)
        rows.append(
            {
                "object_key": key,
                "content": f"{verbe['pure']} — {conj['personne']} ({temps})",
                "verb": verbe["pure"],
                "temps": TEMPS_LABELS.get(temps, temps),
                "personne": conj["personne"],
                "chapter": verbe.get("chapter"),
                "lesson": verbe.get("lesson"),
                "difficulty": difficulty,
                "last_evaluations": last_evaluations,
            }
        )
    return rows


def _build_traduction_rows(by_key: dict, direction: str, used_keys: set | None = None) -> list[dict]:
    phrases = get_dataset("phrase")
    rows = []
    for key, evals in by_key.items():
        lesson_code, position_str, key_direction = key.split("|")
        if key_direction != direction:
            continue
        pool = phrases.get(lesson_code, [])
        position = int(position_str)
        if position < 0 or position >= len(pool):
            continue
        phrase = pool[position]
        source_text = phrase["hebrew"] if direction == "francais" else phrase["french"]
        chapter, lesson = _split_lesson_code(lesson_code)
        difficulty, last_evaluations = _score_and_last5(evals)
        rows.append(
            {
                "object_key": key,
                "content": source_text,
                "chapter": chapter,
                "lesson": lesson,
                "difficulty": difficulty,
                "last_evaluations": last_evaluations,
                "used_in_readiness": bool(used_keys) and key in used_keys,
            }
        )
    return rows


def _build_quizz_rows(by_key: dict) -> list[dict]:
    words = get_dataset("word")
    verbes = get_dataset("verbe")
    rows = []
    for key, evals in by_key.items():
        item_type, item_key = key.split(":", 1)
        item = (words if item_type == "mot" else verbes).get(item_key)
        if item is None:
            continue
        content = item["french"] if item_type == "mot" else item["traduction"]
        difficulty, last_evaluations = _score_and_last5(evals)
        rows.append(
            {
                "object_key": key,
                "content": content,
                "chapter": item.get("chapter"),
                "lesson": item.get("lesson"),
                "difficulty": difficulty,
                "last_evaluations": last_evaluations,
            }
        )
    return rows


def _build_oral_rows(by_key: dict) -> list[dict]:
    texts = get_dataset("text")
    rows = []
    for key, evals in by_key.items():
        text_code, index_str = key.rsplit("|", 1)
        text = texts.get(text_code)
        if text is None:
            continue
        index = int(index_str)
        questions = text.get("questions") or []
        if index < 0 or index >= len(questions):
            continue
        chapter, lesson = _split_lesson_code(text_code)
        difficulty, last_evaluations = _score_and_last5(evals)
        rows.append(
            {
                "object_key": key,
                "content": questions[index]["hebrew"],
                "chapter": chapter,
                "lesson": lesson,
                "difficulty": difficulty,
                "last_evaluations": last_evaluations,
            }
        )
    return rows


_BUILDERS = {
    "mot": lambda by_key, used_keys: _build_mot_rows(by_key),
    "verbe": lambda by_key, used_keys: _build_verbe_rows(by_key),
    "traduction.fr": lambda by_key, used_keys: _build_traduction_rows(by_key, "francais"),
    "traduction.he": lambda by_key, used_keys: _build_traduction_rows(by_key, "hebreu", used_keys),
    "quizz": lambda by_key, used_keys: _build_quizz_rows(by_key),
    "oral": lambda by_key, used_keys: _build_oral_rows(by_key),
}


TOP_N = 25


def build_stats(tab: str, user_id: int, used_keys: set | None = None) -> list[dict] | None:
    """Classement décroissant de difficulté pour un onglet Statistiques
    donné, limité aux TOP_N objets les plus difficiles. Ne liste que les
    objets ayant au moins une évaluation enregistrée. Retourne None si
    `tab` est inconnu. `used_keys` (onglet traduction.he uniquement) marque
    les combos utilisés pour le calcul de l'indice de préparation à
    l'examen (cf. app.readiness) — champ "used_in_readiness" par ligne."""
    object_types = TAB_OBJECT_TYPES.get(tab)
    if object_types is None:
        return None

    by_key = _fetch_evaluations_by_key(object_types, user_id)
    rows = _BUILDERS[tab](by_key, used_keys)
    rows.sort(key=lambda r: r["difficulty"], reverse=True)
    rows = rows[:TOP_N]
    for rank, row in enumerate(rows, start=1):
        row["rank"] = rank
    return rows


def _fetch_user_level(user_id: int) -> str | None:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT level FROM user_level WHERE user_id = ?", (user_id,)
        ).fetchone()
    finally:
        conn.close()
    return row["level"] if row else None


def build_recency_stats(user_id: int) -> list[dict]:
    """Classement décroissant de récence (poids de récence, cf.
    lesson_order.recency_weights) tous types d'objets confondus (mot, verbe,
    traduction, oral), limité aux TOP_N objets les plus récents dans la
    progression du user — contrairement à build_stats, tous les objets des
    leçons débloquées sont inclus, évalués ou non."""
    level = _fetch_user_level(user_id)
    if level is None:
        return []
    level = reference_lesson(level)
    if level is None:
        return []

    weights_by_lesson = recency_weights(level)
    if not weights_by_lesson:
        return []

    lessons = get_dataset("lesson")
    words = get_dataset("word")
    verbes = get_dataset("verbe")
    phrases = get_dataset("phrase")
    texts = get_dataset("text")

    rows = []
    for lesson_code, weight in weights_by_lesson.items():
        chapter, lesson_num = _split_lesson_code(lesson_code)
        lesson = lessons.get(lesson_code, {})

        for w in lesson.get("words", []):
            word = words.get(w)
            if word is None:
                continue
            rows.append(
                {
                    "object_key": f"mot:{w}",
                    "type": "Mot",
                    "content": f"{word['original']} — {word['french']}",
                    "chapter": chapter,
                    "lesson": lesson_num,
                    "lessons_seen": weight,
                    "recency_weight": weight,
                }
            )

        for v in lesson.get("verbs", []):
            verbe = verbes.get(v)
            if verbe is None:
                continue
            rows.append(
                {
                    "object_key": f"verbe:{v}",
                    "type": "Verbe",
                    "content": f"{verbe['pure']} — {verbe['traduction']}",
                    "chapter": chapter,
                    "lesson": lesson_num,
                    "lessons_seen": weight,
                    "recency_weight": weight,
                }
            )

        for i, phrase in enumerate(phrases.get(lesson_code, [])):
            rows.append(
                {
                    "object_key": f"traduction:{lesson_code}|{i}",
                    "type": "Traduction",
                    "content": phrase["french"],
                    "chapter": chapter,
                    "lesson": lesson_num,
                    "lessons_seen": weight,
                    "recency_weight": weight,
                }
            )

        text = texts.get(lesson_code)
        if text:
            for i, q in enumerate(text.get("questions") or []):
                rows.append(
                    {
                        "object_key": f"oral:{lesson_code}|{i}",
                        "type": "Oral",
                        "content": q["hebrew"],
                        "chapter": chapter,
                        "lesson": lesson_num,
                        "lessons_seen": weight,
                        "recency_weight": weight,
                    }
                )

    rows.sort(key=lambda r: r["recency_weight"], reverse=True)
    rows = rows[:TOP_N]
    for rank, row in enumerate(rows, start=1):
        row["rank"] = rank
    return rows
