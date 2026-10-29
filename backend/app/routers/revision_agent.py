import logging

from fastapi import APIRouter, HTTPException, WebSocket

from app.auth import get_user_id
from app.config import GEMINI_API_KEY
from app.data_loader import get_dataset
from app.revision_agent.config import LAST_LESSON, LESSON_CHAPTER, VOICES
from app.revision_agent.passages import lessons_with_text
from app.revision_agent.completion import CompletionSession, availability, qualified_concepts
from app.revision_agent.completion import draw_items as completion_items
from app.revision_agent.comprehension import ComprehensionSession
from app.revision_agent.declension import DeclensionSession
from app.revision_agent.declension import draw_items as declension_items
from app.revision_agent.expression import ExpressionSession
from app.revision_agent.material import vocabulary
from app.revision_agent.reading import ReadingSession
from app.revision_agent.passages import lesson_number
from app.revision_agent.question import QuestionSession
from app.revision_agent.question import draw_items as question_items
from app.revision_agent.topics import TASK_TYPES, topics_for
from app.revision_agent.utterances import lesson_utterances
from app.revision_agent.word import WordSession
from app.revision_agent.word import exercises_for as word_exercises

router = APIRouter(prefix="/api/revision-agent", tags=["revision-agent"])
log = logging.getLogger("revision_agent")


@router.get("/texts")
def texts():
    """Leçons du périmètre (0.01 → 0.20) qui ont un texte : les seules où « Lecture » et « Compréhension » sont proposées."""
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


@router.get("/topics")
def topics(task: str, lesson: str):
    """Sujets qualifiés d'une tâche au niveau `lesson`, avec leurs exercices (prototype sans agent)."""
    if task not in TASK_TYPES or lesson_number(lesson) is None:
        raise HTTPException(status_code=400, detail="Tâche ou leçon inconnue.")
    return topics_for(task, lesson)


@router.websocket("/ws")
async def revision_agent_ws(websocket: WebSocket, pseudo: str, pin: str, lesson: str, voice: str, task: str,
                            current: bool = True, previous: bool = False, per_reading: int = 1):
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

    try:
        await session.run()
    except Exception:
        log.exception("Séance interrompue")
        try:
            await websocket.send_json({"type": "error", "text": "La connexion avec l’agent a été interrompue."})
            await websocket.send_json({"type": "status", "state": "ended"})
        except Exception:
            pass
    try:
        await websocket.close()
    except RuntimeError:
        pass
