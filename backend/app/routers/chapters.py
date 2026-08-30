from fastapi import APIRouter, HTTPException

from app.data_loader import get_dataset
from app.database import DEFAULT_USER_ID, get_connection
from app.text_questions import questions_for_text

router = APIRouter(prefix="/api", tags=["chapters"])


def _chapitre_summary(chap_id: str, chap: dict) -> dict:
    return {
        "id": chap_id,
        "titre": chap["titre"],
        "presentation": chap["presentation"],
        "nb_lessons": len(chap["lessons"]),
    }


@router.get("/chapitres")
def list_chapitres():
    chapitres = get_dataset("chapitre")
    return [
        _chapitre_summary(chap_id, chap)
        for chap_id, chap in sorted(chapitres.items(), key=lambda kv: int(kv[0]))
    ]


@router.get("/chapitres/{chap_id}")
def get_chapitre(chap_id: str):
    chapitres = get_dataset("chapitre")
    if chap_id not in chapitres:
        raise HTTPException(404, "Chapitre introuvable")
    return _chapitre_summary(chap_id, chapitres[chap_id])


@router.get("/chapitres/{chap_id}/lecons")
def list_lecons(chap_id: str):
    chapitres = get_dataset("chapitre")
    if chap_id not in chapitres:
        raise HTTPException(404, "Chapitre introuvable")

    lessons = get_dataset("lesson")
    texts = get_dataset("text")

    result = []
    for code in chapitres[chap_id]["lessons"]:
        lesson = lessons.get(code, {})
        text_key = lesson.get("text") or ""
        titre_texte = texts[text_key]["title"] if text_key and text_key in texts else None
        result.append({"code": code, "titre_texte": titre_texte})
    return result


@router.get("/lecons/{code}")
def get_lecon(code: str):
    lessons = get_dataset("lesson")
    if code not in lessons:
        raise HTTPException(404, "Leçon introuvable")
    lesson = lessons[code]

    # Une leçon peut avoir un texte sans qu'aucune question orale valide n'y
    # soit rattachée (cf. questions_for_text, qui exclut les questions sans
    # champ "hebrew") — l'écran leçon a besoin de le savoir pour griser
    # l'option "Oral" dans ce cas, distinctement de "pas de texte du tout".
    texts = get_dataset("text")
    text_code = lesson.get("text") or ""
    has_oral_questions = bool(questions_for_text(texts, text_code))

    return {**lesson, "has_oral_questions": has_oral_questions}


@router.get("/lecons/{code}/exploration")
def get_lecon_exploration(code: str):
    """Progression d'exploration d'une leçon : B/A sur mots+verbes+
    traductions+texte+oral, "vu" au moins une fois tous modes confondus
    (cf. object_views, table alimentée par POST /api/object-views — oral
    est déjà couvert par `evaluations`, répondre étant sa seule interaction
    possible). Pas de couleur/message ici : transform purement frontend,
    cf. utils/progressColor.js. Le détail par catégorie (`categories`) sert
    à cercler en rouge, sur l'écran de la leçon, les tuiles pas encore
    visitées (seen == 0) parmi celles ayant du contenu (total > 0)."""
    lessons = get_dataset("lesson")
    if code not in lessons:
        raise HTTPException(404, "Leçon introuvable")
    lesson = lessons[code]

    conn = get_connection()
    try:

        def seen_count(object_type: str, keys: list[str]) -> int:
            if not keys:
                return 0
            placeholders = ",".join("?" * len(keys))
            row = conn.execute(
                f"""
                SELECT COUNT(*) AS n FROM object_views
                WHERE user_id = ? AND object_type = ? AND object_key IN ({placeholders})
                """,
                (DEFAULT_USER_ID, object_type, *keys),
            ).fetchone()
            return row["n"]

        categories = {}

        words = lesson.get("words") or []
        categories["mots"] = {"seen": seen_count("mot", words), "total": len(words)}

        verbs = lesson.get("verbs") or []
        categories["verbes"] = {"seen": seen_count("verbe", verbs), "total": len(verbs)}

        phrases_key = lesson.get("phrases")
        phrase_list = get_dataset("phrase").get(phrases_key, []) if phrases_key else []
        categories["traductions"] = {
            "seen": seen_count("phrase", [f"{phrases_key}|{i}" for i in range(len(phrase_list))]),
            "total": len(phrase_list),
        }

        text_code = lesson.get("text") or ""
        text_total = 1 if text_code else 0
        categories["texte"] = {
            "seen": seen_count("texte", [text_code]) if text_code else 0,
            "total": text_total,
        }

        oral_seen = 0
        questions = questions_for_text(get_dataset("text"), text_code) if text_code else []
        if questions:
            oral_row = conn.execute(
                """
                SELECT COUNT(DISTINCT object_key) AS n FROM evaluations
                WHERE user_id = ? AND object_type = 'oral' AND object_key LIKE ?
                """,
                (DEFAULT_USER_ID, f"{text_code}|%"),
            ).fetchone()
            oral_seen = min(oral_row["n"], len(questions))
        categories["oral"] = {"seen": oral_seen, "total": len(questions)}
    finally:
        conn.close()

    seen = sum(c["seen"] for c in categories.values())
    total = sum(c["total"] for c in categories.values())

    return {"seen": seen, "total": total, "categories": categories}


@router.get("/textes/{code}")
def get_texte(code: str):
    texts = get_dataset("text")
    if code not in texts:
        raise HTTPException(404, "Texte introuvable")
    return texts[code]
