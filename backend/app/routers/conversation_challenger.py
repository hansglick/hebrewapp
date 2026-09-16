import asyncio
import base64
import io
import time
import wave

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google.genai import types

from app import conversation_challenger
from app.auth import get_user_id
from app.openai_client import extract_verbatim

router = APIRouter(prefix="/api/conversation-challenger", tags=["conversation-challenger"])

# Même seuil que app.routers.conversation_eval/jdr/revision : sous cette
# taille, un blip de bruit/souffle déclencherait un appel Whisper pour rien.
MIN_TURN_BYTES = 9600


def _pcm_to_wav_bytes(pcm_bytes: bytes, sample_rate: int = 16000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # PCM16
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)
    return buf.getvalue()


@router.websocket("/ws")
async def conversation_challenger_ws(websocket: WebSocket, pseudo: str, pin: str):
    await websocket.accept()

    # Un WebSocket natif ne permet pas d'en-têtes personnalisés côté
    # navigateur (contrairement à apiFetch/X-Pseudo) — l'identité passe donc
    # ici par la query string (cf. app.routers.revision, même choix).
    if get_user_id(pseudo, pin) is None:
        await websocket.send_json({"type": "error", "message": "Identité inconnue"})
        await websocket.close()
        return

    instruction = conversation_challenger.build_system_instruction(pseudo)

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
        async with conversation_challenger.live_client().aio.live.connect(
            model=conversation_challenger.LIVE_MODEL, config=conversation_challenger.build_live_config(instruction)
        ) as session:
            await session.send_client_content(
                turns=types.Content(role="user", parts=[types.Part.from_text(text=conversation_challenger.AMORCE)]),
                turn_complete=True,
            )

            user_buffer = bytearray()
            user_turn_start_ts = None

            # Pas de scores/streak ici (contrairement à app.routers.
            # conversation_eval) : c'est le modèle lui-même qui décide,
            # niveau après niveau, quand s'arrêter — via `student_level`.
            current_level = 1
            final_level = None
            ended = False

            async def from_browser():
                nonlocal user_buffer, user_turn_start_ts
                try:
                    while not ended:
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
                nonlocal user_buffer, user_turn_start_ts, current_level, final_level, ended
                flushed_this_turn = False
                ai_turn_start_ts = None
                while True:
                    turn = session.receive()
                    async for response in turn:
                        got_output = False

                        if response.go_away:
                            # Le serveur prévient qu'il va couper la session de
                            # force (limite de durée côté API) — cf. bug 1008
                            # déjà rencontré sur le premier test conversationnel.
                            # On termine proprement avec le dernier niveau connu.
                            ended = True
                            await safe_send({"type": "conversation_ended", "level": final_level or current_level})
                            try:
                                await websocket.close()
                            except Exception:
                                pass
                            return

                        if data := response.data:
                            got_output = True
                            if ai_turn_start_ts is None:
                                ai_turn_start_ts = time.time()
                            await safe_send({"type": "audio", "data": base64.b64encode(data).decode()})

                        if response.tool_call:
                            # Répond d'ABORD à tous les appels d'outil du lot,
                            # avant de décider quoi que ce soit d'autre — cf.
                            # bug "1007 invalid argument" déjà rencontré et
                            # corrigé sur le premier test conversationnel
                            # (app.routers.conversation_eval).
                            new_level = None
                            got_student_level = None
                            for fc in response.tool_call.function_calls:
                                if fc.name not in ("next_level", "student_level"):
                                    continue
                                try:
                                    level = int(fc.args.get("level"))
                                except (TypeError, ValueError):
                                    level = None
                                await session.send_tool_response(
                                    function_responses=types.FunctionResponse(
                                        id=fc.id, name=fc.name, response={"ok": True}
                                    )
                                )
                                if level is None:
                                    continue
                                if fc.name == "next_level" and 2 <= level <= 11:
                                    new_level = level
                                elif fc.name == "student_level" and 0 <= level <= 11:
                                    got_student_level = level

                            if new_level is not None:
                                current_level = new_level
                                await safe_send({"type": "level", "level": current_level})

                            if got_student_level is not None:
                                final_level = got_student_level
                                ended = True

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
                                if final_level is not None:
                                    # Laisse le tour d'au revoir de l'IA se
                                    # terminer complètement avant de couper —
                                    # même raisonnement que
                                    # app.routers.conversation_eval. Fermer la
                                    # socket ICI (pas seulement dans le finally
                                    # englobant) : sinon from_browser reste
                                    # bloqué sur son receive_json() en attente,
                                    # empêchant le TaskGroup de jamais se
                                    # terminer.
                                    await safe_send({"type": "conversation_ended", "level": final_level})
                                    try:
                                        await websocket.close()
                                    except Exception:
                                        pass
                                    return

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
