import logging

from fastapi import APIRouter, HTTPException, WebSocket

from app.auth import get_user_id
from app.config import GEMINI_API_KEY
from app.data_loader import get_dataset
from app.revision_agent.config import (LAST_LESSON, LESSON_CHAPTER, PHONETIC_MODELS, PRONUNCIATION_MODELS,
                                      TEXT_TEACHER_MODEL, TEXT_TEACHER_MODELS, TTS_MODELS, VOICES, VOWEL_ROUTE_TASKS)
from app.revision_agent.passages import lessons_with_text
from app.revision_agent.completion import CompletionSession, availability, qualified_concepts
from app.revision_agent.completion import schema as completion_schema
from app.revision_agent.completion import draw_items as completion_items
from app.revision_agent.comprehension import ComprehensionSession
from app.revision_agent.comprehension import schema as comprehension_schema
from app.revision_agent.declension import DeclensionSession
from app.revision_agent.declension import draw_items as declension_items
from app.revision_agent.declension import schema as declension_schema
from app.revision_agent.expression import ExpressionSession
from app.revision_agent.intros import congratulations, farewells, intro
from app.revision_agent.journal import SessionJournal
from app.revision_agent.material import vocabulary
from app.revision_agent.reading import ReadingSession
from app.revision_agent.reading import schema as reading_schema
from app.revision_agent import prompts
from app.revision_agent.text_teacher import TextTeacher
from app.revision_agent.passages import lesson_number
from app.revision_agent.question import QuestionSession
from app.revision_agent.question import draw_items as question_items
from app.revision_agent.topics import TASK_TYPES, topics_for
from app.revision_agent.utterances import lesson_utterances
from app.revision_agent.word import WordSession
from app.revision_agent.word import exercises_for as word_exercises

router = APIRouter(prefix="/api/revision-agent", tags=["revision-agent"])
log = logging.getLogger("revision_agent")

# Page texte : les tâches sans mode de langue (cf. prompts.TEXT_LANGUAGE), et leur premier message au prof.
WITHOUT_LANGUAGE_MODE = {"lecture": prompts.READING_START, "comprehension": prompts.COMPREHENSION_START}

# Les tâches et leur schéma (cf. revision_agent.schema), None tant qu'il n'est pas décrit.
SCHEMAS = {"lecture": ("Lecture · SHARP", reading_schema),
           "lecture_sans_assistance": ("Lecture · SHARP wo assistance", lambda: reading_schema("sharp_wo_assistance")),
           "comprehension": ("Compréhension · SHARP", comprehension_schema),
           "comprehension_sans_prononciation": ("Compréhension · SHARP wo prononciation",
                                                lambda: comprehension_schema("sharp_wo_pronunciation")),
           "expression": ("Expression libre", None), "declinaison": ("Déclinaison", declension_schema),
           "completion": ("Complétion · SHARP", completion_schema),
           "completion_sans_prononciation": ("Complétion · SHARP wo prononciation",
                                             lambda: completion_schema("sharp_wo_pronunciation")),
           "mot": ("Mot", None), "question": ("Question", None)}


@router.get("/texts")
def texts():
    """Leçons du périmètre (0.01 → 0.30) qui ont un texte : les seules où « Lecture » et « Compréhension » sont proposées."""
    return lessons_with_text()


@router.get("/vocabulary")
def vocabulary_lessons():
    """Leçons du périmètre qui apportent des mots ou des verbes : la matière de l'expression libre."""
    codes = (f"{LESSON_CHAPTER}.{n:02d}" for n in range(1, LAST_LESSON + 1))
    return [code for code in codes if vocabulary(code, True, False)]


@router.get("/completion")
def completion_lessons():
    """Nombre de complétions de chaque leçon du périmètre, par case (« current » : les concepts de la leçon,
    « previous » : ceux des leçons antérieures) : une leçon sans aucun concept vu est grisée."""
    codes = (f"{LESSON_CHAPTER}.{n:02d}" for n in range(1, LAST_LESSON + 1))
    return {code: availability(code) for code in codes}


@router.get("/schema")
def schemas():
    """Les tâches, et si leur schéma est décrit."""
    return [{"task": task, "label": label, "ready": build is not None} for task, (label, build) in SCHEMAS.items()]


@router.get("/schema/{task}")
def schema(task: str):
    """Le schéma d'une tâche : ses étapes, leurs modèles et ce qu'ils reçoivent, lus dans le code à chaque appel."""
    label, build = SCHEMAS.get(task, (None, None))
    if build is None:
        raise HTTPException(status_code=404, detail="Pas encore de schéma pour cette tâche.")
    return build()


@router.get("/topics")
def topics(task: str, lesson: str):
    """Sujets qualifiés d'une tâche au niveau `lesson`, avec leurs exercices (prototype sans agent)."""
    if task not in TASK_TYPES or lesson_number(lesson) is None:
        raise HTTPException(status_code=400, detail="Tâche ou leçon inconnue.")
    return topics_for(task, lesson)


@router.websocket("/ws")
async def revision_agent_ws(websocket: WebSocket, pseudo: str, pin: str, lesson: str, voice: str, task: str,
                            current: bool = True, previous: bool = False, per_reading: int = 1,
                            mode: str = "voix", teacher_model: str = TEXT_TEACHER_MODEL,
                            tts_model: str | None = None, phonetic_model: str | None = None,
                            pronunciation_model: str | None = None, triage: bool = True):
    await websocket.accept()

    async def refuse(text: str, code: int = 1008) -> None:
        await websocket.send_json({"type": "error", "text": text})
        await websocket.close(code=code)

    # Un WebSocket natif ne permet pas d'en-têtes personnalisés côté navigateur : l'identité passe
    # par la query string (cf. app.routers.conversation_challenger, même choix).
    if get_user_id(pseudo, pin) is None:
        return await refuse("Identité inconnue")
    if voice not in VOICES:
        return await refuse("Voix inconnue.")
    if mode == "texte" and teacher_model not in TEXT_TEACHER_MODELS:
        return await refuse("Modèle du prof inconnu.")
    if tts_model is not None and tts_model not in TTS_MODELS:
        return await refuse("Modèle de voix inconnu.")
    if phonetic_model is not None and phonetic_model not in PHONETIC_MODELS:
        return await refuse("Modèle de la phonétique inconnu.")
    if pronunciation_model is not None and pronunciation_model not in PRONUNCIATION_MODELS:
        return await refuse("Modèle de la prononciation inconnu.")
    if task == "lecture":
        # Toujours le texte de la leçon choisie, quelles que soient les cases cochées (cf. demande explicite du user).
        if lesson not in lessons_with_text():
            return await refuse("Cette leçon n'a pas de texte.")
        lessons = [lesson]
        if not GEMINI_API_KEY:
            return await refuse("Clé API manquante côté serveur.", 1011)
        session = ReadingSession(websocket, voice, lessons, per_reading)
    elif task == "comprehension":
        # Toujours le texte de la leçon choisie, quelles que soient les cases cochées (cf. demande explicite du user).
        if lesson not in lessons_with_text():
            return await refuse("Cette leçon n'a pas de texte.")
        if not get_dataset("text")[lesson].get("questions"):
            return await refuse("Ce texte n'a pas de questions.")
        if not GEMINI_API_KEY:
            return await refuse("Clé API manquante côté serveur.", 1011)
        # Toujours en conversation, évaluation orale comprise, comme l'expression libre (cf. demande explicite du user).
        session = ComprehensionSession(websocket, voice, lesson)
    elif task == "expression":
        # Questions tirées des sujets d'expression du niveau choisi, quelles que soient les cases cochées (cf.
        # demande explicite du user) ; toujours en conversation, évaluation orale comprise.
        if not topics_for("expression", lesson):
            return await refuse("Aucune question d'expression libre à ce niveau.")
        if not GEMINI_API_KEY:
            return await refuse("Clé API manquante côté serveur.", 1011)
        session = ExpressionSession(websocket, voice, lesson)
    elif task == "declinaison":
        # Phrases tirées dans les sujets de déclinaison du niveau, les leçons cochées d'abord (cf. declension.draw_items).
        items = declension_items(lesson, current, previous)
        if not items:
            return await refuse("Aucune phrase à décliner pour ces leçons.")
        if not GEMINI_API_KEY:
            return await refuse("Clé API manquante côté serveur.", 1011)
        session = DeclensionSession(websocket, voice, lesson, items)
    elif task == "completion":
        # Concepts déjà vus au niveau choisi, selon les cases cochées (cf. completion.draw_items).
        items = completion_items(lesson, current, previous)
        if not items:
            return await refuse("Aucune phrase à compléter pour ces leçons.")
        if not GEMINI_API_KEY:
            return await refuse("Clé API manquante côté serveur.", 1011)
        session = CompletionSession(websocket, voice, lesson, items, qualified_concepts(lesson, current, previous))
    elif task == "mot":
        pool = lesson_utterances(lesson, current, previous)
        if not any(word_exercises(code, u, lesson_number(lesson)) for code, u in pool):
            return await refuse("Aucun mot à proposer pour ces leçons.")
        if not GEMINI_API_KEY:
            return await refuse("Clé API manquante côté serveur.", 1011)
        session = WordSession(websocket, voice, lesson, pool)
    elif task == "question":
        items = question_items(lesson, current, previous)
        if not items:
            return await refuse("Aucune phrase à questionner pour ces leçons.")
        if not GEMINI_API_KEY:
            return await refuse("Clé API manquante côté serveur.", 1011)
        session = QuestionSession(websocket, voice, lesson, items)
    else:
        return await refuse("Cette tâche n'est pas encore disponible.")
    if mode == "texte":
        # Page « mode texte », toutes les tâches (cf. demande explicite du user) : le prof écrit, sans Gemini Live (cf.
        # text_teacher.py), et l'élève enregistre ses réponses ; avec tts_model, le prof dit aussi chaque prise de
        # parole (cf. tts.py).
        # Compréhension sans phonétique (config « SHARP wo prononciation », cf. demande explicite du user) : le prof ne
        # reçoit que la transcription, et ne juge pas la prononciation (cf. prompts.text_mode).
        without_phonetic = task == "comprehension" and phonetic_model is None
        if task == "declinaison":
            # Déclinaison (cf. demande explicite du user) : l'application juge les phrases redites et y répond ; le prof
            # donne les consignes et converse, sans mode de langue ni prononciation entendue (cf. judge_by_app).
            session.judge_by_app(prompts.without_language_mode(prompts.declension_text_instructions(
                len(session.items))))
            without_phonetic = True
        elif task == "completion":
            # Complétion (cf. demande explicite du user) : l'application trie, juge les phrases (quatre juges, cf.
            # completion_judges) et y répond ; le prof donne les consignes et converse, sans mode de langue ni
            # prononciation entendue (la prononciation a son propre juge).
            session.judge_by_app(prompts.without_language_mode(prompts.completion_text_instructions(
                len(session.items))))
            without_phonetic = True
        elif task in WITHOUT_LANGUAGE_MODE:
            # Lecture et compréhension (cf. demande explicite du user) : plus de mode de langue ; le prof répond en
            # français aux répliques de l'élève, en hébreu au reste (cf. prompts.TEXT_LANGUAGE). Ni bouton, ni
            # changer_langue, ni rappel du mode dans les messages ; l'accueil et l'au revoir, en hébreu.
            session.language_modes, session.language = False, "he"
            session.live.instructions = prompts.without_language_mode(session.live.instructions)
            session.live.start_message = WITHOUT_LANGUAGE_MODE[task]
            session.live.tools = [tool for tool in session.live.tools if tool["name"] != "changer_langue"]
        session.live = TextTeacher.replacing(session.live, teacher_model, tts_model, phonetic=not without_phonetic)
        # Case « Double route voyelle » cochée : la réponse enregistrée est aussi transcrite en lettres latines,
        # voyelles comprises, par ce modèle (cf. transcribe.heard_phonetic).
        session.phonetic_model = phonetic_model if task in VOWEL_ROUTE_TASKS else None
        # Sa prononciation est alors jugée à part, par ce modèle, en même temps que le reste (cf.
        # judges.mispronounced).
        session.pronunciation_model = pronunciation_model or PRONUNCIATION_MODELS[0]
        # Lecture, configuration « SHARP wo assistance » (cf. demande explicite du user) : sans le tri lecture /
        # question au prof (cf. reading.to_teacher), tout envoi est une lecture.
        session.reading_triage = triage
        # La transcription en direct (cf. live_transcribe.py) n'est plus utilisée : Gemini Transcribe, d'un bloc, pour
        # toutes les configs de la lecture, moins cher pour un résultat proche (cf. demande explicite du user).
        session.live_transcription = False
        # L'accueil enregistré de la tâche, dans le mode de langue de départ, joué tout de suite (cf. intros.py).
        if welcome := intro(task, getattr(session, "language", None), tts_model, voice):
            session.live.intro = welcome
            session.known_translations[welcome["text"]] = welcome
        # L'au revoir fixe, commun à toutes les tâches (cf. TextTeacher.end), et ses traductions toutes faites.
        if isinstance(session.live, TextTeacher):
            session.live.farewells = farewells(tts_model, voice)
            for entry in session.live.farewells.values():
                session.known_translations[entry["text"]] = entry
        # Déclinaison : les félicitations enregistrées (cf. intros.congratulations).
        if task in ("declinaison", "completion") and session.app_judges:
            session.congratulations = congratulations(tts_model, voice)

    # Journal de la séance sur le disque persistant : déroulé et durée, par compte (cf. app.revision_agent.journal).
    journal = SessionJournal(get_user_id(pseudo, pin), pseudo, task, lesson, voice=voice, current=current,
                             previous=previous, per_reading=per_reading)
    session.attach(journal)
    reason = "fin"
    try:
        await session.run()
    except Exception:
        reason = "erreur"
        log.exception("Séance interrompue")
        try:
            await websocket.send_json({"type": "error", "text": "La connexion avec l’agent a été interrompue."})
            await websocket.send_json({"type": "status", "state": "ended"})
        except Exception:
            pass
    finally:
        journal.close(reason, score=getattr(session, "score", None))
    try:
        await websocket.close()
    except RuntimeError:
        pass
