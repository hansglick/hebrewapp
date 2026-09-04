import asyncio
import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel

from google.genai.errors import APIError
from openai import APIError as OpenAIAPIError

from app.auth import get_current_user_id
from app.data_loader import add_chanson, get_dataset
from app.database import get_connection
from app.difficulty import compute_combo_difficulties, pick_sequential, weighted_pick
from app.gemini import (
    evaluate_oral,
    evaluate_orals_grouped,
    evaluate_report,
    evaluate_reports_grouped,
    evaluate_translation,
    evaluate_translations_grouped,
    extract_lyrics,
)
from app.openai_client import DICTIONNAIRE_PROMPT_FR, extract_verbatim
from app.lesson_order import recency_weights
from app.text_questions import questions_for_text
from app.youtube import extraire_cle_youtube

router = APIRouter(prefix="/api", tags=["gemini"])


def _record_evaluation(user_id: int, object_type: str, object_key: str, score: int):
    conn = get_connection()
    try:
        conn.execute(
            """
            INSERT INTO evaluations (user_id, object_type, object_key, success, score)
            VALUES (?, ?, ?, NULL, ?)
            """,
            (user_id, object_type, object_key, score),
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
def gemini_translation(payload: TranslationEvalRequest, user_id: int = Depends(get_current_user_id)):
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
    _record_evaluation(user_id, "phrase_gemini", object_key, result["score"])

    return result


class TranslationGroupedItem(BaseModel):
    identifiant: str
    lesson_code: str
    position: int
    direction: str
    student_solution: str


@router.post("/gemini/translation/grouped")
def gemini_translation_grouped(payload: list[TranslationGroupedItem], user_id: int = Depends(get_current_user_id)):
    if not payload:
        return []

    phrases = get_dataset("phrase")
    items = []
    for entry in payload:
        pool = phrases.get(entry.lesson_code, [])
        if entry.position < 0 or entry.position >= len(pool):
            raise HTTPException(404, "Phrase introuvable")
        phrase = pool[entry.position]
        sentence_to_translate = phrase["hebrew"] if entry.direction == "francais" else phrase["french"]
        items.append(
            {
                "identifiant": entry.identifiant,
                "sentence_to_translate": sentence_to_translate,
                "student_solution": entry.student_solution,
            }
        )

    try:
        results = evaluate_translations_grouped(items)
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except APIError as exc:
        raise HTTPException(502, f"Erreur Gemini : {exc.message}")

    by_identifiant = {r["identifiant"]: r for r in results}
    output = []
    for entry in payload:
        result = by_identifiant.get(entry.identifiant)
        if result is None:
            raise HTTPException(502, "Réponse Gemini incomplète, réessaie.")
        merged = {**result, "translation": entry.student_solution}
        object_key = f"{entry.lesson_code}|{entry.position}|{entry.direction}"
        _record_evaluation(user_id, "phrase_gemini", object_key, merged["score"])
        output.append(merged)

    return output


class LyricsExtractRequest(BaseModel):
    youtube_url: str


@router.post("/chansons/extract")
def extract_chanson(payload: LyricsExtractRequest):
    key = extraire_cle_youtube(payload.youtube_url)
    if key is None:
        raise HTTPException(400, "Cette adresse ne ressemble pas à une URL YouTube valide.")

    chansons = get_dataset("chanson")
    existing_position = next((i for i, c in enumerate(chansons) if c.get("key") == key), None)
    if existing_position is not None:
        return {"position": existing_position, **chansons[existing_position]}

    try:
        videodata = extract_lyrics(payload.youtube_url, key)
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except APIError as exc:
        raise HTTPException(502, f"Erreur Gemini : {exc.message}")
    except (KeyError, ValueError, TypeError):
        raise HTTPException(502, "Réponse de Gemini invalide, réessaie.")

    add_chanson(videodata)
    position = len(get_dataset("chanson")) - 1
    return {"position": position, **videodata}


@router.get("/questions-orales/random")
def random_question_orale(
    lesson_code: str,
    mode: str = "exploration",
    current: str | None = None,
    seen: list[str] = Query(default=[]),
    user_id: int = Depends(get_current_user_id),
):
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
        current_pair = None
        if current:
            text_code_part, sep, index_part = current.rpartition("|")
            if sep and index_part.isdigit():
                current_pair = (text_code_part, int(index_part))
        text_code, q_index = pick_sequential(own_pairs, current_pair)
        draw_pool = None
    else:
        # `global_texts` liste des lesson_code (= text_code, même format),
        # déjà cumulative (inclut lesson_code lui-même) : chaque question
        # reçoit le poids de récence du texte auquel elle appartient.
        weights_by_lesson = recency_weights(lesson_code)
        recency_pool = {}
        for tc in lesson.get("global_texts", []):
            weight = weights_by_lesson.get(tc)
            if weight is None:
                continue
            for _, i in questions_for_text(texts_data, tc):
                recency_pool[f"{tc}|{i}"] = weight

        difficulty_pool = {
            k: v for k, v in compute_combo_difficulties("oral", user_id).items() if k in recency_pool
        }

        picked, draw_pool = weighted_pick(difficulty_pool, recency_pool, set(seen))
        if picked is None:
            raise HTTPException(404, "Aucune question orale disponible pour ce tirage")
        draw_key = picked
        text_code, q_index_str = picked.rsplit("|", 1)
        q_index = int(q_index_str)

    text = texts_data[text_code]
    question = text["questions"][q_index]
    result = {
        "text_code": text_code,
        "question_index": q_index,
        "question_hebrew": question["hebrew"],
        "question_french": question["french"],
        "texte_hebrew": text["text"],
        "voicepath": text["voicepath"],
    }
    if draw_pool is not None:
        chapter, _, lesson_num = text_code.partition(".")
        result["chapter"] = chapter
        result["lesson"] = lesson_num
        result["pool"] = draw_pool
        result["draw_key"] = draw_key
    return result


@router.post("/gemini/oral")
async def gemini_oral(
    text_code: str = Form(...),
    question_index: int = Form(...),
    audio: UploadFile = File(...),
    user_id: int = Depends(get_current_user_id),
):
    texts_data = get_dataset("text")
    text = texts_data.get(text_code)
    if text is None or question_index < 0 or question_index >= len(text.get("questions", [])):
        raise HTTPException(404, "Question introuvable")

    question = text["questions"][question_index]
    audio_bytes = await audio.read()

    try:
        # evaluate_oral() est bloquant (upload + polling + appel Gemini
        # synchrones) : l'exécuter directement bloquerait toute la boucle
        # asyncio pendant ~10-30s, empêchant même la requête GET
        # /waiting-vids de la vidéo d'attente d'aboutir pendant ce temps.
        result = await asyncio.to_thread(
            evaluate_oral,
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
    _record_evaluation(user_id, "oral", object_key, aggregate_score)

    return result


@router.post("/gemini/oral/grouped")
async def gemini_oral_grouped(
    items: str = Form(...),
    audios: list[UploadFile] = File(...),
    user_id: int = Depends(get_current_user_id),
):
    # `items` : JSON stringifié [{identifiant, text_code, question_index}] ;
    # chaque fichier de `audios` porte son identifiant comme nom (sans
    # extension, cf. evaluateOralsGrouped côté frontend) pour associer les
    # deux sans avoir à nommer dynamiquement des champs de formulaire.
    try:
        entries = json.loads(items)
    except (json.JSONDecodeError, TypeError):
        raise HTTPException(400, "Champ 'items' invalide")
    if not entries:
        return []

    texts_data = get_dataset("text")
    entries_by_id = {}
    grouped_by_text: dict[str, dict] = {}
    for entry in entries:
        identifiant = entry["identifiant"]
        text_code = entry["text_code"]
        question_index = entry["question_index"]
        text = texts_data.get(text_code)
        if text is None or question_index < 0 or question_index >= len(text.get("questions", [])):
            raise HTTPException(404, "Question introuvable")
        entries_by_id[identifiant] = entry
        group = grouped_by_text.setdefault(text_code, {"identifiant_texte": text_code, "texte": text["text"], "questions": []})
        group["questions"].append(
            {"identifiant_question": identifiant, "question_hebrew": text["questions"][question_index]["hebrew"]}
        )

    audio_items = []
    for upload in audios:
        identifiant = (upload.filename or "").rsplit(".", 1)[0]
        if identifiant not in entries_by_id:
            raise HTTPException(400, "Fichier audio sans correspondance dans 'items'")
        audio_items.append(
            {
                "identifiant_texte": entries_by_id[identifiant]["text_code"],
                "identifiant_question": identifiant,
                "audio_bytes": await upload.read(),
                "mime_type": upload.content_type or "audio/webm",
            }
        )

    try:
        # Bloquant (upload + polling + appel Gemini synchrones) — cf.
        # gemini_oral pour la même raison de délégation à un thread.
        results = await asyncio.to_thread(evaluate_orals_grouped, list(grouped_by_text.values()), audio_items)
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except APIError as exc:
        raise HTTPException(502, f"Erreur Gemini : {exc.message}")

    by_identifiant = {r["identifiant_question"]: r for r in results}
    output = []
    for identifiant, entry in entries_by_id.items():
        result = by_identifiant.get(identifiant)
        if result is None:
            raise HTTPException(502, "Réponse Gemini incomplète, réessaie.")
        aggregate_score = round(
            (result["rating_completeness"] + result["rating_hebrew"] + result["rating_comprehension"]) / 3
        )
        object_key = f"{entry['text_code']}|{entry['question_index']}"
        _record_evaluation(user_id, "oral", object_key, aggregate_score)
        output.append({**result, "identifiant": identifiant})

    return output


@router.post("/gemini/verbatim")
async def gemini_verbatim(
    audio: UploadFile = File(...), lang: str = Form("he"), context: str | None = Form(None)
):
    audio_bytes = await audio.read()
    prompt = DICTIONNAIRE_PROMPT_FR if context == "dictionnaire" and lang == "fr" else None

    try:
        result = await asyncio.to_thread(
            extract_verbatim, audio_bytes, audio.content_type or "audio/wav", language=lang, prompt=prompt
        )
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except OpenAIAPIError as exc:
        raise HTTPException(502, f"Erreur OpenAI : {exc}")

    return result


class ReportEvalRequest(BaseModel):
    text_code: str
    rapport: str


@router.post("/gemini/rapport")
def gemini_rapport(payload: ReportEvalRequest):
    texts_data = get_dataset("text")
    text = texts_data.get(payload.text_code)
    if text is None:
        raise HTTPException(404, "Texte introuvable")

    try:
        result = evaluate_report(payload.rapport, text["text"])
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except APIError as exc:
        raise HTTPException(502, f"Erreur Gemini : {exc.message}")

    return result


class ReportGroupedItem(BaseModel):
    identifiant: str
    text_code: str
    rapport: str


@router.post("/gemini/rapport/grouped")
def gemini_rapport_grouped(payload: list[ReportGroupedItem]):
    if not payload:
        return []

    texts_data = get_dataset("text")
    items = []
    for entry in payload:
        text = texts_data.get(entry.text_code)
        if text is None:
            raise HTTPException(404, "Texte introuvable")
        items.append({"identifiant": entry.identifiant, "texte": text["text"], "rapport": entry.rapport})

    try:
        results = evaluate_reports_grouped(items)
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except APIError as exc:
        raise HTTPException(502, f"Erreur Gemini : {exc.message}")

    by_identifiant = {r["identifiant"]: r for r in results}
    output = []
    for entry in payload:
        result = by_identifiant.get(entry.identifiant)
        if result is None:
            raise HTTPException(502, "Réponse Gemini incomplète, réessaie.")
        output.append({**result, "rapport": entry.rapport})

    return output
