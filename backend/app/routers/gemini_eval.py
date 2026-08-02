import random

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from google.genai.errors import APIError

from app.data_loader import get_dataset
from app.database import DEFAULT_USER_ID, get_connection
from app.difficulty import compute_combo_difficulties, stratified_pick
from app.gemini import evaluate_oral, evaluate_translation
from app.text_questions import questions_for_text

router = APIRouter(prefix="/api", tags=["gemini"])


def _record_evaluation(object_type: str, object_key: str, score: int):
    conn = get_connection()
    try:
        conn.execute(
            """
            INSERT INTO evaluations (user_id, object_type, object_key, success, score)
            VALUES (?, ?, ?, NULL, ?)
            """,
            (DEFAULT_USER_ID, object_type, object_key, score),
        )
        conn.commit()
    finally:
        conn.close()


class TranslationEvalRequest(BaseModel):
    lesson_code: str
    position: int
    direction: str  # "hebreu" (source français) | "francais" (source hébreu)
    student_solution: str


@router.post("/gemini/translation")
def gemini_translation(payload: TranslationEvalRequest):
    phrases = get_dataset("phrase")
    pool = phrases.get(payload.lesson_code, [])
    if payload.position < 0 or payload.position >= len(pool):
        raise HTTPException(404, "Phrase introuvable")

    phrase = pool[payload.position]
    sentence_to_translate = phrase["hebrew"] if payload.direction == "francais" else phrase["french"]

    try:
        result = evaluate_translation(sentence_to_translate, payload.student_solution)
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except APIError as exc:
        raise HTTPException(502, f"Erreur Gemini : {exc.message}")

    object_key = f"{payload.lesson_code}|{payload.position}|{payload.direction}"
    _record_evaluation("phrase_gemini", object_key, result["score"])

    return result


@router.get("/questions-orales/random")
def random_question_orale(lesson_code: str, mode: str = "exploration"):
    lessons = get_dataset("lesson")
    lesson = lessons.get(lesson_code)
    if lesson is None:
        raise HTTPException(404, "Leçon introuvable")

    texts_data = get_dataset("text")

    if mode == "exploration":
        own_code = lesson.get("text") or ""
        own_pairs = questions_for_text(texts_data, own_code)
        if not own_pairs:
            raise HTTPException(404, "Aucune question orale disponible pour cette leçon")
        text_code, q_index = random.choice(own_pairs)
    else:
        own_code = lesson.get("text") or ""
        own_keys = [f"{tc}|{i}" for tc, i in questions_for_text(texts_data, own_code)]

        cumulative_keys = []
        for tc in lesson.get("global_texts", []):
            cumulative_keys.extend(f"{tc}|{i}" for _, i in questions_for_text(texts_data, tc))

        difficulties = compute_combo_difficulties("oral")
        picked = stratified_pick(own_keys, cumulative_keys, difficulties)
        if picked is None:
            raise HTTPException(404, "Aucune question orale disponible pour ce tirage")
        text_code, q_index_str = picked.rsplit("|", 1)
        q_index = int(q_index_str)

    text = texts_data[text_code]
    question = text["questions"][q_index]
    return {
        "text_code": text_code,
        "question_index": q_index,
        "question_hebrew": question["hebrew"],
        "question_french": question["french"],
        "texte_hebrew": text["text"],
        "voicepath": text["voicepath"],
    }


@router.post("/gemini/oral")
async def gemini_oral(
    text_code: str = Form(...),
    question_index: int = Form(...),
    audio: UploadFile = File(...),
):
    texts_data = get_dataset("text")
    text = texts_data.get(text_code)
    if text is None or question_index < 0 or question_index >= len(text.get("questions", [])):
        raise HTTPException(404, "Question introuvable")

    question = text["questions"][question_index]
    audio_bytes = await audio.read()

    try:
        result = evaluate_oral(
            question["hebrew"],
            text["text"],
            audio_bytes,
            audio.content_type or "audio/webm",
        )
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except APIError as exc:
        raise HTTPException(502, f"Erreur Gemini : {exc.message}")

    aggregate_score = round(
        (result["rating_completeness"] + result["rating_hebrew"] + result["rating_comprehension"]) / 3
    )
    object_key = f"{text_code}|{question_index}"
    _record_evaluation("oral", object_key, aggregate_score)

    return result
