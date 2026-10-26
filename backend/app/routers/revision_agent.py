import logging

from fastapi import APIRouter, WebSocket

from app.auth import get_user_id
from app.config import GEMINI_API_KEY, OPENAI_API_KEY
from app.revision_agent.config import VOICES
from app.revision_agent.passages import candidate_lessons, lessons_with_text
from app.revision_agent.comprehension import ComprehensionSession
from app.revision_agent.reading import ReadingSession

router = APIRouter(prefix="/api/revision-agent", tags=["revision-agent"])
log = logging.getLogger("revision_agent")


@router.get("/texts")
def texts():
    """Leçons du périmètre (0.01 → 0.20) qui ont un texte : les seules où « Lecture » et « Compréhension » sont proposées."""
    return lessons_with_text()


@router.websocket("/ws")
async def revision_agent_ws(websocket: WebSocket, pseudo: str, pin: str, lesson: str, voice: str, task: str,
                            current: bool = True, previous: bool = False):
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
        lessons = candidate_lessons(lesson, current, previous)
        if not lessons:
            return await refuse("Aucun texte à lire pour ces leçons.")
        if not (GEMINI_API_KEY and OPENAI_API_KEY):  # prof et extracteur (Gemini), évaluateur (OpenAI)
            return await refuse("Clé API manquante côté serveur.", 1011)
        session = ReadingSession(websocket, voice, lessons)
    elif task == "comprehension":
        # Toujours le texte de la leçon choisie, quelles que soient les cases cochées (cf. demande explicite du user).
        if lesson not in lessons_with_text():
            return await refuse("Cette leçon n'a pas de texte.")
        if not GEMINI_API_KEY:
            return await refuse("Clé API manquante côté serveur.", 1011)
        session = ComprehensionSession(websocket, voice, lesson)
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
