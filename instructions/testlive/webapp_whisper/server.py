"""
Variante de webapp/server.py : la conversation (voix + verbatim de l'IA)
reste sur Gemini Live, mais le verbatim de l'ÉTUDIANT est retranscrit par
Whisper (openai_client.extract_verbatim, déjà utilisé ailleurs dans l'app
pour l'hébreu parlé) au lieu de `input_audio_transcription` de l'API Live —
celle-ci a tendance à "corriger" silencieusement la parole de l'étudiant
vers une phrase grammaticalement correcte, ce qui est justement ce qu'on ne
veut PAS pour repérer ses erreurs réelles.

Découpage en tours : `response.voice_activity` ne se déclenche pas en
pratique avec la détection vocale automatique par défaut, donc on accumule
l'audio brut envoyé par le navigateur depuis le dernier envoi, et on le
bascule vers Whisper dès la première miette de réponse de l'IA (audio ou
transcript) — signal dont on est sûr qu'il arrive.

Setup (réutilise le venv du backend principal) :
    cd instructions/testlive/webapp_whisper
    ../../../backend/.venv/Scripts/python.exe server.py
Puis ouvrir http://localhost:8101 (au casque, pour éviter le larsen).
"""

import asyncio
import base64
import io
import json
import os
import time
import wave
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from google import genai
from google.genai import types
from openai import OpenAI

HERE = Path(__file__).resolve().parent
BACKEND_ENV = HERE.parent.parent.parent / "backend" / ".env"
load_dotenv(BACKEND_ENV)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
LIVE_MODEL = "models/gemini-3.1-flash-live-preview"
WHISPER_MODEL = "whisper-1"
# Sous le seuil, un blip de bruit/souffle déclencherait un appel Whisper pour
# rien (et échoue souvent sur un clip quasi-vide) — ~0.3s de PCM16 16kHz mono.
MIN_TURN_BYTES = 9600

app = FastAPI(title="Testlive — Conversation en direct (verbatim user via Whisper)")

gemini_client = genai.Client(http_options={"api_version": "v1beta"}, api_key=GEMINI_API_KEY)
openai_client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

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

# Pas d'input_audio_transcription ici : remplacé par Whisper.
# output_audio_transcription conservé (le verbatim de l'IA, lui, n'a pas
# besoin d'être fidèle à des erreurs — il n'y en a pas).
LIVE_CONFIG = types.LiveConnectConfig(
    response_modalities=["AUDIO"],
    media_resolution="MEDIA_RESOLUTION_MEDIUM",
    speech_config=types.SpeechConfig(
        voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Zephyr"))
    ),
    output_audio_transcription=types.AudioTranscriptionConfig(language_codes=["he-Hebr-IL"]),
    system_instruction=types.Content(
        parts=[types.Part.from_text(text=PERSONA_INSTRUCTION)],
        role="user",
    ),
)


def _pcm_to_wav_bytes(pcm_bytes: bytes, sample_rate: int = 16000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # PCM16
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)
    return buf.getvalue()


def _transcribe_with_whisper(pcm_bytes: bytes) -> str:
    """Bloquant (appel OpenAI synchrone) — à lancer via asyncio.to_thread."""
    wav_bytes = _pcm_to_wav_bytes(pcm_bytes)
    buf = io.BytesIO(wav_bytes)
    buf.name = "turn.wav"
    transcript = openai_client.audio.transcriptions.create(
        model=WHISPER_MODEL,
        file=buf,
        language="he",
        # Même technique d'amorçage que openai_client.py::_DEFAULT_PROMPTS :
        # biaise fortement vers l'hébreu sur un clip court/ambigu.
        prompt="זהו תמלול בעברית של תלמיד הלומד עברית.",
    )
    return transcript.text


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
    if not openai_client:
        await websocket.send_json({"type": "error", "message": "OPENAI_API_KEY absente de backend/.env"})
        await websocket.close()
        return

    send_lock = asyncio.Lock()

    async def safe_send(payload: dict):
        async with send_lock:
            await websocket.send_json(payload)

    async def transcribe_and_send(pcm_bytes: bytes, turn_ts: float):
        if len(pcm_bytes) < MIN_TURN_BYTES:
            return
        try:
            text = await asyncio.to_thread(_transcribe_with_whisper, pcm_bytes)
        except Exception as exc:  # noqa: BLE001 — prototype : on veut voir l'erreur côté navigateur
            await safe_send({"type": "error", "message": f"Whisper : {exc}"})
            return
        if text and text.strip():
            # Whisper est plus lent que le flux Gemini : ce message peut donc
            # arriver APRÈS un ai_transcript/turn_complete plus récent —
            # `ts` (horodaté au tout début de ce tour de parole, pas à la
            # réception du résultat) permet au front de le replacer à sa
            # vraie place chronologique plutôt qu'à la fin du journal.
            await safe_send({"type": "user_transcript_final", "text": text, "ts": turn_ts})

    try:
        async with gemini_client.aio.live.connect(model=LIVE_MODEL, config=LIVE_CONFIG) as session:
            user_buffer = bytearray()
            user_turn_start_ts = None

            async def from_browser():
                nonlocal user_buffer, user_turn_start_ts
                try:
                    while True:
                        msg = await websocket.receive_json()
                        if msg.get("type") == "audio":
                            pcm_bytes = base64.b64decode(msg["data"])
                            if not user_buffer:
                                user_turn_start_ts = time.time()
                            user_buffer.extend(pcm_bytes)
                            await session.send_realtime_input(
                                audio=types.Blob(data=pcm_bytes, mime_type="audio/pcm;rate=16000")
                            )
                except WebSocketDisconnect:
                    pass

            async def from_gemini():
                # response.voice_activity (ACTIVITY_START/END) ne semble pas être
                # émis avec la détection vocale automatique par défaut (rien dans
                # les stubs du SDK ne le garantit, et en pratique il ne se
                # déclenche jamais) — on se rabat sur un signal dont on est sûr
                # qu'il arrive : la première miette de réponse de l'IA (audio ou
                # transcript) marque la fin du tour de parole de l'étudiant.
                nonlocal user_buffer, user_turn_start_ts
                flushed_this_turn = False
                ai_turn_start_ts = None
                while True:
                    turn = session.receive()
                    async for response in turn:
                        got_output = False

                        if data := response.data:
                            got_output = True
                            if ai_turn_start_ts is None:
                                ai_turn_start_ts = time.time()
                            await safe_send({"type": "audio", "data": base64.b64encode(data).decode()})

                        content = response.server_content
                        if content:
                            if content.output_transcription and content.output_transcription.text:
                                got_output = True
                                if ai_turn_start_ts is None:
                                    ai_turn_start_ts = time.time()
                                await safe_send(
                                    {"type": "ai_transcript", "text": content.output_transcription.text}
                                )
                            if content.turn_complete:
                                await safe_send({"type": "turn_complete", "ts": ai_turn_start_ts or time.time()})
                                flushed_this_turn = False
                                ai_turn_start_ts = None

                        if got_output and not flushed_this_turn and user_buffer:
                            flushed_this_turn = True
                            snapshot = bytes(user_buffer)
                            turn_ts = user_turn_start_ts or time.time()
                            user_buffer = bytearray()
                            user_turn_start_ts = None
                            asyncio.create_task(transcribe_and_send(snapshot, turn_ts))

            async with asyncio.TaskGroup() as tg:
                tg.create_task(from_browser())
                tg.create_task(from_gemini())

    except* WebSocketDisconnect:
        pass
    except* Exception as eg:  # noqa: BLE001
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

    uvicorn.run(app, host="0.0.0.0", port=8101)
