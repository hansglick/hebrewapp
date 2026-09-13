import asyncio
import base64
import io
import time
import wave

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google.genai import types

from app import conversation_eval
from app.auth import get_user_id
from app.openai_client import extract_verbatim

router = APIRouter(prefix="/api/conversation-eval", tags=["conversation-eval"])

# Même seuil que app.routers.jdr/revision : sous cette taille, un blip de
# bruit/souffle déclencherait un appel Whisper pour rien.
MIN_TURN_BYTES = 9600

# Nombre d'exercices réels de traduction (hors warm-up) — cf.
# app.conversation_eval.draw_phrases_for_test.
TOTAL_QUESTIONS = 11
STOP_STREAK = 3


def _pcm_to_wav_bytes(pcm_bytes: bytes, sample_rate: int = 16000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # PCM16
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)
    return buf.getvalue()


@router.websocket("/ws")
async def conversation_eval_ws(websocket: WebSocket, pseudo: str, pin: str):
    await websocket.accept()

    # Un WebSocket natif ne permet pas d'en-têtes personnalisés côté
    # navigateur (contrairement à apiFetch/X-Pseudo) — l'identité passe donc
    # ici par la query string (cf. app.routers.revision, même choix).
    if get_user_id(pseudo, pin) is None:
        await websocket.send_json({"type": "error", "message": "Identité inconnue"})
        await websocket.close()
        return

    phrases = conversation_eval.draw_phrases_for_test()
    instruction = conversation_eval.build_system_instruction(pseudo, phrases)

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
        async with conversation_eval.live_client().aio.live.connect(
            model=conversation_eval.LIVE_MODEL, config=conversation_eval.build_live_config(instruction)
        ) as session:
            await session.send_client_content(
                turns=types.Content(role="user", parts=[types.Part.from_text(text=conversation_eval.AMORCE)]),
                turn_complete=True,
            )

            user_buffer = bytearray()
            user_turn_start_ts = None

            scores: list[int] = []
            consecutive_ones = 0
            wrap_up_sent = False
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
                nonlocal user_buffer, user_turn_start_ts, consecutive_ones, wrap_up_sent, ended
                flushed_this_turn = False
                ai_turn_start_ts = None
                while True:
                    turn = session.receive()
                    async for response in turn:
                        got_output = False

                        if response.go_away:
                            # Le serveur prévient qu'il va couper la session
                            # de force (limite de durée côté API, sans
                            # rapport avec nos 11 questions/3 erreurs) — si on
                            # ne ferme pas nous-mêmes avant l'échéance, ça
                            # remonte comme une erreur 1008 "failed to close
                            # after goaway" côté navigateur. On termine donc
                            # la conversation proprement avec les scores déjà
                            # obtenus, comme pour les autres cas de fin.
                            ended = True
                            await safe_send({"type": "conversation_ended", "scores": scores})
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
                            for fc in response.tool_call.function_calls:
                                if fc.name != "report_evaluation":
                                    continue
                                try:
                                    score = int(fc.args.get("score"))
                                except (TypeError, ValueError):
                                    score = None
                                await session.send_tool_response(
                                    function_responses=types.FunctionResponse(
                                        id=fc.id, name=fc.name, response={"ok": True}
                                    )
                                )
                                if score not in (1, 2, 3):
                                    continue
                                scores.append(score)
                                await safe_send({"type": "score", "score": score, "index": len(scores)})
                                consecutive_ones = consecutive_ones + 1 if score == 1 else 0

                                if not wrap_up_sent and consecutive_ones >= STOP_STREAK:
                                    wrap_up_sent = True
                                    ended = True
                                    await session.send_client_content(
                                        turns=types.Content(
                                            role="user",
                                            parts=[types.Part.from_text(text=conversation_eval.WRAP_UP_TOO_MANY_ERRORS)],
                                        ),
                                        turn_complete=True,
                                    )
                                elif not wrap_up_sent and len(scores) >= TOTAL_QUESTIONS:
                                    wrap_up_sent = True
                                    ended = True
                                    await session.send_client_content(
                                        turns=types.Content(
                                            role="user",
                                            parts=[types.Part.from_text(text=conversation_eval.WRAP_UP_TEST_COMPLETE)],
                                        ),
                                        turn_complete=True,
                                    )

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
                                if wrap_up_sent:
                                    # Laisse le tour d'au revoir de l'IA se
                                    # terminer complètement avant de couper —
                                    # cf. demande explicite du user ("si la
                                    # communication se coupe d'elle même").
                                    # Fermer la socket ICI (pas seulement
                                    # dans le finally englobant) : sinon
                                    # from_browser reste bloqué sur son
                                    # receive_json() en attente, empêchant le
                                    # TaskGroup de jamais se terminer.
                                    await safe_send({"type": "conversation_ended", "scores": scores})
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
