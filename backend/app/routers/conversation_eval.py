import asyncio
import base64
import io
import random
import time
import wave

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from google.genai import types
from pydantic import BaseModel

from app import conversation_eval
from app.auth import get_current_user_id, get_user_id
from app.database import DEFAULT_LEVEL, set_user_level
from app.lesson_order import all_lesson_codes_in_order
from app.openai_client import extract_verbatim
from app.phrase_sampling import phrases_by_set

router = APIRouter(prefix="/api/conversation-eval", tags=["conversation-eval"])

# Même seuil que app.routers.jdr/revision : sous cette taille, un blip de
# bruit/souffle déclencherait un appel Whisper pour rien.
MIN_TURN_BYTES = 9600

STOP_STREAK = 3


class ApplyPlacementRequest(BaseModel):
    start_lesson: str


@router.post("/apply-placement")
def apply_placement(payload: ApplyPlacementRequest, user_id: int = Depends(get_current_user_id)):
    """Applique réellement le niveau estimé (cf. ConversationTestScreen.jsx)
    — écriture en base. `level` = la leçon juste avant `start_lesson` dans
    l'ordre global du cours, pour que reference_lesson(level) redonne
    exactement `start_lesson`."""
    codes = all_lesson_codes_in_order()
    if payload.start_lesson not in codes:
        level = DEFAULT_LEVEL
    else:
        idx = codes.index(payload.start_lesson)
        level = codes[idx - 1] if idx > 0 else DEFAULT_LEVEL
    set_user_level(user_id, level)
    return {"level": level}


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

    instruction = conversation_eval.build_system_instruction(pseudo)

    # Donnée structurelle (pas un score) : sert au frontend à retrouver la
    # leçon de départ recommandée une fois le niveau (index de set) connu.
    await websocket.send_json({"type": "set_starts", "codes": conversation_eval.first_lesson_per_set()})

    # Pools mélangés une fois par connexion : le tirage dans un set se fait
    # ensuite par simple .pop(), sans remise au sein de cette session — cf.
    # demande explicite du user ("tirer aléatoirement une question dans le
    # set"). Chaque pool compte plusieurs centaines de phrases (vérifié),
    # jamais de risque d'épuisement (au plus 3 tirages par set avant que le
    # test n'avance ou ne s'arrête).
    remaining_by_set: dict[int, list[dict]] = {}
    for set_index, pool in phrases_by_set().items():
        shuffled = list(pool)
        random.shuffle(shuffled)
        remaining_by_set[set_index] = shuffled

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

            # État autoritaire tenu par LE SERVEUR (pas par les arguments
            # envoyés par le modèle à next_question, cf. demande explicite
            # du user "le backend garde sa propre vérité") :
            warmup_scores: list[int] = []
            current_set = 1
            mastered_level = 0  # dernier set où un score=3 a été obtenu
            consecutive_ones = 0
            final_level = None
            last_sent_set = None
            ended = False
            # Phrase déjà servie pour la question EN COURS, tant qu'elle n'a
            # pas encore été notée — cf. bug rapporté par le user : sans ça,
            # un double appel à `next_question` (le modèle hésitant/
            # rappelant l'outil par erreur) piochait deux phrases
            # différentes, et le modèle se corrigeait à voix haute en plein
            # énoncé. Remise à None dès qu'un score réel arrive (la question
            # est alors terminée, la prochaine devra être une VRAIE
            # nouvelle pioche).
            pending_phrase: dict | None = None

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
                nonlocal user_buffer, user_turn_start_ts
                nonlocal current_set, mastered_level, consecutive_ones, final_level, last_sent_set, ended
                nonlocal pending_phrase
                flushed_this_turn = False
                ai_turn_start_ts = None
                while True:
                    turn = session.receive()
                    async for response in turn:
                        got_output = False

                        if response.go_away:
                            # Le serveur prévient qu'il va couper la session de
                            # force (limite de durée côté API) — cf. bug 1008
                            # déjà rencontré. On termine proprement avec le
                            # dernier niveau connu.
                            ended = True
                            await safe_send({"type": "conversation_ended", "level": final_level or mastered_level})
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
                            # Répond d'ABORD à TOUS les appels d'outil du lot,
                            # avant de décider quoi que ce soit d'autre — cf.
                            # bug "1007 invalid argument" déjà rencontré et
                            # corrigé sur ce même test.
                            warmup_new: list[int] = []
                            real_new: list[int] = []
                            next_question_calls: list[types.FunctionCall] = []

                            for fc in response.tool_call.function_calls:
                                if fc.name == "report_warmup_evaluation":
                                    try:
                                        score = int(fc.args.get("score"))
                                    except (TypeError, ValueError):
                                        score = None
                                    await session.send_tool_response(
                                        function_responses=types.FunctionResponse(
                                            id=fc.id, name=fc.name, response={"ok": True}
                                        )
                                    )
                                    if score in (1, 3):
                                        warmup_new.append(score)

                                elif fc.name == "report_evaluation":
                                    try:
                                        score = int(fc.args.get("score"))
                                    except (TypeError, ValueError):
                                        score = None
                                    await session.send_tool_response(
                                        function_responses=types.FunctionResponse(
                                            id=fc.id, name=fc.name, response={"ok": True}
                                        )
                                    )
                                    if score in (1, 3):
                                        real_new.append(score)

                                elif fc.name == "next_question":
                                    # Traité APRÈS avoir répondu (la phrase
                                    # tirée dépend du set courant, qui peut
                                    # encore changer selon les scores traités
                                    # ci-dessous dans ce même lot) — mais la
                                    # réponse à l'outil doit partir tout de
                                    # suite quand même.
                                    next_question_calls.append(fc)

                            # Scores d'échauffement : jamais comptés dans
                            # l'algorithme de niveau, juste relayés pour
                            # affichage (contrôle temporaire, cf. demande
                            # explicite du user).
                            for score in warmup_new:
                                warmup_scores.append(score)
                                await safe_send(
                                    {"type": "warmup_score", "score": score, "index": len(warmup_scores)}
                                )

                            # Scores du vrai test : pilotent le set courant et
                            # la condition d'arrêt.
                            for score in real_new:
                                await safe_send({"type": "score", "score": score, "set": current_set})
                                # La question qui vient d'être notée est
                                # terminée : le prochain `next_question`
                                # devra vraiment piocher une nouvelle phrase.
                                pending_phrase = None
                                if score == 3:
                                    mastered_level = current_set
                                    consecutive_ones = 0
                                    if current_set >= 11:
                                        final_level = 11
                                        ended = True
                                    else:
                                        current_set += 1
                                else:
                                    consecutive_ones += 1
                                    if consecutive_ones >= STOP_STREAK:
                                        final_level = mastered_level
                                        ended = True

                            # `next_question` : le backend garde sa propre
                            # vérité (current_set) plutôt que de faire
                            # confiance aux arguments du modèle — cf. demande
                            # explicite du user. On répond quand même à
                            # CHAQUE appel du lot (protocole), y compris si
                            # `ended` vient de basculer à True dans ce même
                            # lot (réponse best-effort, la conversation se
                            # termine juste après).
                            for fc in next_question_calls:
                                # Idempotent : tant qu'aucun score réel n'est
                                # arrivé depuis, un nouvel appel renvoie la
                                # MÊME phrase déjà servie, jamais une
                                # nouvelle pioche — cf. bug rapporté par le
                                # user.
                                if pending_phrase is None:
                                    pool = remaining_by_set.get(current_set) or []
                                    pending_phrase = pool.pop() if pool else None
                                phrase = pending_phrase
                                await session.send_tool_response(
                                    function_responses=types.FunctionResponse(
                                        id=fc.id,
                                        name=fc.name,
                                        response={
                                            "french": phrase["french"] if phrase else "",
                                            "set": current_set,
                                        },
                                    )
                                )
                                if phrase and current_set != last_sent_set:
                                    last_sent_set = current_set
                                    await safe_send({"type": "set", "set": current_set})

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
                                if ended:
                                    # Laisse le tour d'au revoir de l'IA (déjà
                                    # déclenché par sa propre règle 7, aucun
                                    # message silencieux injecté ici — cf.
                                    # demande explicite du user) se terminer
                                    # complètement avant de couper. Fermer la
                                    # socket ICI (pas seulement dans le
                                    # finally englobant) : sinon from_browser
                                    # reste bloqué sur son receive_json() en
                                    # attente, empêchant le TaskGroup de
                                    # jamais se terminer.
                                    await safe_send(
                                        {"type": "conversation_ended", "level": final_level or mastered_level}
                                    )
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
