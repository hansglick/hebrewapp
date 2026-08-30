import asyncio
import base64
import io
import time
import wave

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from google.genai import types

from app import jdr
from app.openai_client import extract_verbatim

router = APIRouter(prefix="/api/jdr", tags=["jdr"])

# Sous le seuil, un blip de bruit/souffle déclencherait un appel Whisper pour
# rien (et échoue souvent sur un clip quasi-vide) — ~0.3s de PCM16 16kHz mono.
MIN_TURN_BYTES = 9600


@router.get("/chapitre/{chap_id}")
def get_jdr_chapitre(chap_id: str):
    """{lesson_code: {role_etudiant, objectif_etudiant}} pour tout le
    chapitre — la route "/chapitre/{chap_id}" a deux segments après le
    préfixe, donc ne peut jamais être capturée par "/{code}" (un seul
    segment) ci-dessous, quel que soit l'ordre d'enregistrement."""
    items = jdr.get_jdr_items_for_chapter(chap_id)
    return {
        code: {"role_etudiant": item["role_etudiant"], "objectif_etudiant": item["objectif_etudiant"]}
        for code, item in items.items()
    }


@router.get("/{code}")
def get_jdr(code: str):
    item = jdr.get_jdr_item(code)
    if item is None:
        raise HTTPException(404, f"Aucun jeu de rôle pour la leçon {code!r}")
    return {
        "lesson_code": code,
        "objectif_etudiant": item["objectif_etudiant"],
        "image_url": jdr.jdr_image_url(code),
    }


def _pcm_to_wav_bytes(pcm_bytes: bytes, sample_rate: int = 16000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # PCM16
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)
    return buf.getvalue()


@router.websocket("/{code}/ws")
async def jdr_ws(websocket: WebSocket, code: str):
    await websocket.accept()

    item = jdr.get_jdr_item(code)
    if item is None:
        await websocket.send_json({"type": "error", "message": f"Aucun jeu de rôle pour la leçon {code!r}"})
        await websocket.close()
        return

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
        # Whisper est plus lent que le flux Gemini : ce message peut donc
        # arriver APRÈS un ai_transcript/turn_complete plus récent — `ts`
        # (horodaté au tout début de ce tour de parole, pas à la réception
        # du résultat) permet au front de le replacer à sa vraie place
        # chronologique plutôt qu'à la fin du journal.
        if text and text.strip():
            await safe_send({"type": "user_transcript_final", "text": text, "ts": turn_ts})

    try:
        async with jdr.live_client().aio.live.connect(
            model=jdr.LIVE_MODEL, config=jdr.build_live_config(item)
        ) as session:
            amorce = (item.get("amorce") or "").strip()
            if amorce:
                await session.send_client_content(
                    turns=types.Content(role="user", parts=[types.Part.from_text(text=amorce)]),
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
                # response.voice_activity (ACTIVITY_START/END) ne se déclenche
                # pas en pratique avec la détection vocale automatique par
                # défaut — on se rabat sur un signal dont on est sûr qu'il
                # arrive : la première miette de réponse de l'IA (audio ou
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
