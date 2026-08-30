"""Indice de préparation à l'examen suivant — indicateur "Réviser" de
l'accueil.

Double verrou avant de pouvoir noter quoi que ce soit : au moins 15 réponses
distinctes de traduction français->hébreu depuis la réussite du dernier
examen (celui qui a réellement fait progresser le niveau, cf.
`level_history` — un repassage d'un examen déjà réussi n'y touche jamais),
ET au moins 5 d'entre elles dans le périmètre du prochain examen (leçon en
cours / 5 dernières leçons / chapitre en cours selon rapide/long/tres_long).
Une fois les deux verrous passés : indice = 1 - moyenne des scores de
difficulté (le même score Beta déjà utilisé partout ailleurs) des questions
du périmètre."""

from app.data_loader import get_dataset
from app.database import get_connection
from app.lesson_order import all_lesson_codes_in_order, exam_type_for, reference_lesson
from app.stats import _fetch_evaluations_by_key, _score_and_last5

MIN_TOTAL_ANSWERED = 15
MIN_SCOPE_ANSWERED = 5
READY_THRESHOLD = 0.7

# object_type "phrase_auto" (auto-évaluation) et "phrase_gemini" (noté par
# Gemini) représentent le même objet pédagogique — cf. stats.py, même
# fusion que l'onglet "Tes erreurs" -> Traductions fr->hé.
TRANSLATION_OBJECT_TYPES = ["phrase_auto", "phrase_gemini"]
# direction nomme la langue CIBLE, pas la source (cf. gemini_eval.py) :
# "hebreu" = source français -> cible hébreu, exactement ce qu'on veut ici.
FR_TO_HE_DIRECTION = "hebreu"


def _last_exam_cutoff(conn, user_id: int) -> str:
    row = conn.execute(
        "SELECT MAX(reached_at) AS cutoff FROM level_history WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    return row["cutoff"] if row and row["cutoff"] else ""


def _scope_lessons(exam_format: str, reference_code: str) -> list[str]:
    if exam_format == "rapide":
        return [reference_code]

    codes = all_lesson_codes_in_order()
    if reference_code not in codes:
        return [reference_code]
    idx = codes.index(reference_code)

    if exam_format == "long":
        return codes[: idx + 1][-5:]

    # tres_long : toutes les leçons du chapitre de la leçon de référence.
    chap_id = reference_code.partition(".")[0]
    chapitre = get_dataset("chapitre").get(chap_id)
    return list(chapitre["lessons"]) if chapitre else [reference_code]


def _eligible_fr_to_he_keys(conn, cutoff: str, user_id: int) -> dict[str, list]:
    """{object_key: evals} pour chaque combo fr->hé ayant au moins une
    évaluation postérieure à `cutoff` — `evals` garde tout l'historique du
    combo (pas seulement les évaluations post-cutoff), pour que le score de
    difficulté reste calculé exactement comme partout ailleurs dans l'app
    (5 dernières évaluations, sans filtrage de date)."""
    by_key = _fetch_evaluations_by_key(TRANSLATION_OBJECT_TYPES, user_id)
    eligible = {}
    for key, evals in by_key.items():
        _, _, direction = key.split("|")
        if direction != FR_TO_HE_DIRECTION:
            continue
        if any(ev["created_at"] > cutoff for ev in evals):
            eligible[key] = evals
    return eligible


def compute_readiness(user_id: int) -> dict:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT level FROM user_level WHERE user_id = ?", (user_id,)
        ).fetchone()
        level = row["level"] if row else None
        reference_code = reference_lesson(level) if level is not None else reference_lesson(None)
        if reference_code is None:
            return {"status": "not_ready", "blocking": "total", "count": 0, "target": MIN_TOTAL_ANSWERED}

        exam_format = exam_type_for(reference_code)
        cutoff = _last_exam_cutoff(conn, user_id)
        eligible = _eligible_fr_to_he_keys(conn, cutoff, user_id)
    finally:
        conn.close()

    total_count = len(eligible)
    if total_count < MIN_TOTAL_ANSWERED:
        return {
            "status": "not_ready",
            "blocking": "total",
            "count": total_count,
            "target": MIN_TOTAL_ANSWERED,
            "format": exam_format,
        }

    scope = set(_scope_lessons(exam_format, reference_code))
    in_scope = {k: v for k, v in eligible.items() if k.split("|")[0] in scope}
    scope_count = len(in_scope)

    if scope_count < MIN_SCOPE_ANSWERED:
        return {
            "status": "not_ready",
            "blocking": "scope",
            "count": scope_count,
            "target": MIN_SCOPE_ANSWERED,
            "format": exam_format,
        }

    difficulties = [_score_and_last5(evals)[0] for evals in in_scope.values()]
    # float()/bool() : define_difficulty_score renvoie un numpy.float64 (via
    # scipy.stats.beta.ppf), que jsonable_encoder ne sait pas sérialiser tel
    # quel (ni lui, ni le numpy.bool_ qu'une comparaison sur ce type produit).
    performance = float(1 - (sum(difficulties) / len(difficulties)))

    return {
        "status": "scored",
        "performance": performance,
        "ready": bool(performance > READY_THRESHOLD),
        "format": exam_format,
        "used_keys": list(in_scope.keys()),
    }
