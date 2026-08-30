"""
Side web app de test pour la feature "Conversation en direct" (voir
instructions/testlive/boulanger.py, dont ce prototype s'inspire directement :
même modèle Gemini Live, même persona/system_instruction, mais piloté depuis
une page web au lieu du micro/webcam local en CLI).

Serveur relais minimal, volontairement séparé du reste de l'app (backend/) :
- sert la page statique (index.html) ;
- expose un WebSocket /ws qui, à la connexion d'un navigateur, ouvre une
  session Gemini Live côté serveur (la clé API ne quitte jamais le serveur)
  et relaie l'audio dans les deux sens :
    navigateur -> ce serveur -> Gemini Live (PCM16 16kHz)
    Gemini Live -> ce serveur -> navigateur (PCM16 24kHz)

Setup (réutilise le venv du backend principal, google-genai déjà présent) :
    cd instructions/testlive/webapp
    ../../../backend/.venv/Scripts/python.exe server.py
Puis ouvrir http://localhost:8100 (au casque, pour éviter le larsen micro/
haut-parleurs pendant que l'IA parle).
"""

import asyncio
import base64
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from google import genai
from google.genai import types

HERE = Path(__file__).resolve().parent
BACKEND_ENV = HERE.parent.parent.parent / "backend" / ".env"
load_dotenv(BACKEND_ENV)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
LIVE_MODEL = "models/gemini-3.1-flash-live-preview"

app = FastAPI(title="Testlive — Conversation en direct (prototype)")

client = genai.Client(http_options={"api_version": "v1beta"}, api_key=GEMINI_API_KEY)

# Vocabulaire du user jusqu'à sa leçon 0.05 (cf. app.vocabulary.vocabulaire_jusqu_a
# côté backend principal) — sert à calibrer la persona ci-dessous sur ce que
# l'étudiant a réellement déjà vu, pas sur un hébreu générique.
STUDENT_VOCABULARY = {
    "words": [
        "ספר", "אוטובוס", "יפה", "פריז", "ירושלים", "מה", "זאת", "גינה", "מכונית",
        "אולפן", "אבל", "עליד", "טלוויזיה", "דירה", "מוסיקה", "קטן", "חלון",
        "שולחן", "כיסא", "מאיפה", "כיתה", "ב", "מכתב", "עיתון", "ל", "מ",
        "תלמיד", "זה", "מי", "גם", "איפה", "לאכן", "עברית", "תלאביב", "לאן",
        "עיר", "גדול", "מטוס", "רכבת", "מיטה",
    ],
    "verbs": ["לגור", "לשמוע", "ללמוד", "לנוח", "לכתוב", "לראות", "לטוס", "לעבוד"],
}

PERSONA_INSTRUCTION = (
    "Tu es Maya, une jeune étudiante qui attend le bus à Tel-Aviv. Tu dois répondre "
    "ou engager la conversation avec un autre étudiant. Toutes tes prises de parole, "
    "remarques et questions doivent l'amener à utiliser le vocabulaire ci-dessous :\n"
    + json.dumps(STUDENT_VOCABULARY, ensure_ascii=False, indent=2)
    + "\n\n"
    "Ce jeu de rôle a lieu dans le cadre d'une application d'apprentissage de l'hébreu. "
    "En conséquence, tu dois :\n"
    "- Faire des phrases courtes (une seule question, pas plus)\n"
    "- Parler lentement et distinctement\n"
    "- Utiliser exclusivement la langue hébreu\n"
    "- Utiliser autant que possible les mots et les verbes présents dans le vocabulaire "
    "passé ci-dessus\n"
    "- La conversation doit rester fluide et ne surtout pas ressembler à un interrogatoire : "
    "rebondis le plus possible sur les réponses de l'étudiant plutôt que d'enchaîner "
    "question sur question\n"
    "- Change de sujet de conversation seulement de temps en temps, le plus rarement possible"
)

LIVE_CONFIG = types.LiveConnectConfig(
    response_modalities=["AUDIO"],
    media_resolution="MEDIA_RESOLUTION_MEDIUM",
    speech_config=types.SpeechConfig(
        voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Zephyr"))
    ),
    # Verbatim texte de l'audio, en plus de l'audio lui-même — output = ce
    # que dit l'IA, input = ce que dit le user (transcrit côté serveur).
    # language_codes en BCP-47 langue+SCRIPT+région ("he-Hebr-IL", pas
    # juste "he-IL") : sans le sous-tag de script (ISO 15924), le modèle
    # peut romaniser certains passages au lieu d'écrire en alphabet hébreu.
    output_audio_transcription=types.AudioTranscriptionConfig(language_codes=["he-Hebr-IL"]),
    input_audio_transcription=types.AudioTranscriptionConfig(language_codes=["he-Hebr-IL"]),
    system_instruction=types.Content(
        parts=[types.Part.from_text(text=PERSONA_INSTRUCTION)],
        role="user",
    ),
)


@app.get("/")
def index():
    return FileResponse(HERE / "static" / "index.html")


@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await websocket.accept()

    if not GEMINI_API_KEY:
        await websocket.send_json({"type": "error", "message": "GEMINI_API_KEY absente de backend/.env"})
        await websocket.close()
        return

    try:
        async with client.aio.live.connect(model=LIVE_MODEL, config=LIVE_CONFIG) as session:

            async def from_browser():
                try:
                    while True:
                        msg = await websocket.receive_json()
                        if msg.get("type") == "audio":
                            pcm_bytes = base64.b64decode(msg["data"])
                            # session.send(input={...}) construit l'ancien champ
                            # realtime_input.media_chunks, désormais déprécié par
                            # l'API (cf. erreur 1007) — send_realtime_input est le
                            # remplaçant attendu.
                            await session.send_realtime_input(
                                audio=types.Blob(data=pcm_bytes, mime_type="audio/pcm;rate=16000")
                            )
                except WebSocketDisconnect:
                    pass

            async def from_gemini():
                while True:
                    turn = session.receive()
                    async for response in turn:
                        if data := response.data:
                            await websocket.send_json(
                                {"type": "audio", "data": base64.b64encode(data).decode()}
                            )

                        content = response.server_content
                        if content:
                            # Transcript en morceaux (deltas) — le front les
                            # concatène jusqu'au prochain tour.
                            if content.output_transcription and content.output_transcription.text:
                                await websocket.send_json(
                                    {"type": "ai_transcript", "text": content.output_transcription.text}
                                )
                            if content.input_transcription and content.input_transcription.text:
                                await websocket.send_json(
                                    {"type": "user_transcript", "text": content.input_transcription.text}
                                )
                            if content.turn_complete:
                                await websocket.send_json({"type": "turn_complete"})

            async with asyncio.TaskGroup() as tg:
                tg.create_task(from_browser())
                tg.create_task(from_gemini())

    except* WebSocketDisconnect:
        pass
    except* Exception as eg:  # noqa: BLE001 — prototype de test, on veut juste voir l'erreur côté navigateur
        try:
            await websocket.send_json({"type": "error", "message": str(eg.exceptions[0])})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8100)
