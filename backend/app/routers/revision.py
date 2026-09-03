import asyncio
import base64
import io
import time
import wave

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from google.genai import types

from app import revision
from app.auth import get_user_id
from app.lesson_order import all_lesson_codes_in_order
from app.openai_client import extract_verbatim

router = APIRouter(prefix="/api/revision", tags=["revision"])

# Même seuil que app.routers.jdr : sous cette taille, un blip de bruit/souffle
# déclencherait un appel Whisper pour rien.
MIN_TURN_BYTES = 9600


@router.get("/{code}")
def get_revision(code: str):
    if code not in all_lesson_codes_in_order():
        raise HTTPException(404, f"Leçon inconnue : {code!r}")
    return {"lesson_code": code}


def _pcm_to_wav_bytes(pcm_bytes: bytes, sample_rate: int = 16000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # PCM16
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)
    return buf.getvalue()


@router.websocket("/{code}/ws")
async def revision_ws(websocket: WebSocket, code: str, pseudo: str, pin: str):
    await websocket.accept()

    # Un WebSocket natif ne permet pas d'en-têtes personnalisés côté
    # navigateur (contrairement à apiFetch/X-Pseudo) — l'identité passe donc
    # ici par la query string (cf. api/revision.js::revisionWebSocketUrl).
    if get_user_id(pseudo, pin) is None:
        await websocket.send_json({"type": "error", "message": "Identité inconnue"})
        await websocket.close()
        return

    instruction = revision.get_revision_instruction(code)
    if instruction is None:
        await websocket.send_json({"type": "error", "message": f"Aucune révision pour la leçon {code!r}"})
        await websocket.close()
        return
    # {pseudo} reste littéral dans item_revision.json (généré hors ligne,
    # sans connaître l'utilisateur) — cf. REVISION_SYSTEM_INSTRUCTION_TEMPLATE.
    instruction = instruction.replace("{pseudo}", pseudo)

    send_lock = asyncio.Lock()

    async def safe_send(payload: dict):
        async with send_lock:
            try:
                await websocket.send_json(payload)
            except Exception:
                pass

    async def transcribe_and_send(pcm_bytes: bytes, turn_ts: float):
        if len(pcm_bytes) < MIN_TURN_BYTES:
            return
        try:
            wav_bytes = _pcm_to_wav_bytes(pcm_bytes)
            result = await asyncio.to_thread(extract_verbatim, wav_bytes, "audio/wav", "he")
        except Exception as exc:  # noqa: BLE001 — on veut voir l'erreur côté navigateur
            await safe_send({"type": "error", "message": f"Whisper : {exc}"})
            return
        text = result.get("verbatim", "")
        if text and text.strip():
            await safe_send({"type": "user_transcript_final", "text": text, "ts": turn_ts})

    try:
        async with revision.live_client().aio.live.connect(
            model=revision.LIVE_MODEL, config=revision.build_live_config(instruction)
        ) as session:
            await session.send_client_content(
                turns=types.Content(role="user", parts=[types.Part.from_text(text=revision.AMORCE)]),
                turn_complete=True,
            )

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
    except* Exception as eg:  # noqa: BLE001 — on veut voir l'erreur côté navigateur
        try:
            await websocket.send_json({"type": "error", "message": str(eg.exceptions[0])})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
