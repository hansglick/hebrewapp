from fastapi import APIRouter, HTTPException

from app.data_loader import get_dataset

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
    return lessons[code]


@router.get("/textes/{code}")
def get_texte(code: str):
    texts = get_dataset("text")
    if code not in texts:
        raise HTTPException(404, "Texte introuvable")
    return texts[code]
