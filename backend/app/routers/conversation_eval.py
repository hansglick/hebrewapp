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
from app.phrase_sampling import selected_phrases_by_set

router = APIRouter(prefix="/api/conversation-eval", tags=["conversation-eval"])

# Même seuil que app.routers.jdr/revision : sous cette taille, un blip de
# bruit/souffle déclencherait un appel Whisper pour rien.
MIN_TURN_BYTES = 9600

# Kill switch : DÉSACTIVÉ (cf. bug rapporté par le user) — le signal utilisé
# (`len(user_buffer)`, cf. `heard_user_audio_since_phrase` plus bas) partage
# le même buffer que le flush de transcription Whisper, qui peut être vidé
# PLUSIEURS fois pendant une seule réponse de l'étudiant (dès que l'IA
# produit un nouveau tour de parole) — fragmentant l'accumulation en petits
# morceaux qui, individuellement, ne franchissaient jamais le seuil, même
# quand l'étudiant avait bel et bien répondu normalement. Un score de 3
# parfaitement valide pouvait ainsi être ignoré à tort : `pending_phrase` ne
# se libérait jamais, et le `next_question` suivant renvoyait la MÊME
# phrase déjà notée — l'étudiant se voyait alors "redemander" une réponse
# déjà validée, et le niveau final retombait à 0 malgré de bons scores. Ne
# PAS repasser à True sans remplacer ce signal par un compteur dédié,
# indépendant des flushs de transcription.
REQUIRE_USER_AUDIO_BEFORE_SCORE = False

# Filet de sécurité contre un modèle qui s'arrête de lui-même (cf. règle 7 du
# prompt, "ne t'arrête jamais de poser des questions" — l'IA n'a plus AUCUNE
# autorité sur la fin du test, cf. demande explicite du user). Remplace
# l'ancienne détection du mot "raccroche" dans la parole de l'IA (peu fiable :
# soit elle ne disait rien du tout et restait silencieuse, soit elle pouvait
# le prononcer à tort) par une surveillance du DÉLAI depuis le dernier appel
# à `next_question` — si ce délai dépasse ce seuil ALORS QUE la dernière
# question tirée a déjà été notée (`pending_phrase is None`, donc rien
# n'explique légitimement l'attente, contrairement à une reformulation en
# cours), on relance l'IA nous-mêmes avec un message silencieux.
WATCHDOG_CHECK_INTERVAL_S = 2
WATCHDOG_STALL_THRESHOLD_S = 15

LOG_TAG = "[conv-eval]"

WATCHDOG_NUDGE_TEXT = (
    "[Message système, ne jamais évoquer devant l'étudiant] Le test continue. "
    "Appelle immédiatement l'outil next_question pour poser la question suivante."
)

STOP_STREAK = 3
# Nombre de scores=3 requis DANS LE SET COURANT avant de passer au set
# suivant — cf. demande explicite du user. Pas forcément consécutifs (des
# score=1 intercalés ne remettent pas ce compteur à zéro, seul un passage
# de set le fait) ; "mastered_level" (utilisé pour le rapport final,
# "dernier set contenant au moins un score de 3") reste lui mis à jour dès
# le 1er score=3, indépendamment de ce seuil d'avancement. Valeur de BASE :
# si l'étudiant a déjà échoué exactement 2 fois dans le set courant
# (`ones_in_set == 2`), le seuil réellement appliqué passe à 3 au lieu de
# 2 — cf. demande explicite du user (voir son usage plus bas).
REQUIRED_THREES_PER_SET = 2

# Stratégie de tirage adaptative au sein d'un set (cf. demande explicite du
# user) : le pool curé d'un set (ordre chronologique = ordre affiché sur
# /dev/phrase-curation) est découpé en 3 strates de taille égale (le reste
# de la division va aux premières strates, ex. 10 phrases -> 4/3/3). La 1ère
# question d'un set est tirée au hasard dans tout le set ; ensuite, un
# score=3 fait avancer à la strate SUIVANTE (cyclique 0->1->2->0), un
# score=1 fait repiocher dans la MÊME strate.
NUM_STRATA = 3


def _split_into_strata(pool: list[dict]) -> list[list[dict]]:
    base, extra = divmod(len(pool), NUM_STRATA)
    strata: list[list[dict]] = []
    start = 0
    for i in range(NUM_STRATA):
        size = base + (1 if i < extra else 0)
        strata.append(list(pool[start : start + size]))
        start += size
    return strata


def _draw_from_strata(
    strata: list[list[dict]], last_stratum: int | None, last_score: int | None
) -> tuple[dict | None, int | None]:
    """Pioche une phrase dans les strates `strata` (mutées en place : la
    phrase piochée en est retirée), selon la stratégie ci-dessus. Repli
    automatique sur une autre strate non vide si la strate ciblée est
    épuisée. Retourne (None, None) si le set entier est épuisé."""
    if last_stratum is None:
        candidates = [i for i, s in enumerate(strata) if s]
        if not candidates:
            return None, None
        weights = [len(strata[i]) for i in candidates]
        target = random.choices(candidates, weights=weights, k=1)[0]
    else:
        target = (last_stratum + 1) % len(strata) if last_score == 3 else last_stratum
        if not strata[target]:
            fallback = [i for i, s in enumerate(strata) if s]
            if not fallback:
                return None, None
            target = random.choice(fallback)
    phrase = strata[target].pop()
    return phrase, target


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

    # Strates mélangées une fois par connexion : le tirage dans une strate se
    # fait ensuite par simple .pop(), sans remise au sein de cette session —
    # cf. _draw_from_strata pour la stratégie de choix de strate. Limité aux
    # phrases retenues manuellement via l'outil de curation
    # (/dev/phrase-curation, cf. demande explicite du user) — chaque pool en
    # compte au moins 82 (vérifié), jamais de risque d'épuisement (au plus 3
    # tirages par set avant que le test n'avance ou ne s'arrête).
    remaining_strata_by_set: dict[int, list[list[dict]]] = {}
    for set_index, pool in selected_phrases_by_set().items():
        strata = _split_into_strata(pool)
        for stratum in strata:
            random.shuffle(stratum)
        remaining_strata_by_set[set_index] = strata

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
            mastered_level = 0  # dernier set où AU MOINS UN score=3 a été obtenu
            threes_in_set = 0  # score=3 déjà obtenus dans le set courant
            # score=1 déjà obtenus DANS LE SET COURANT (pas seulement
            # consécutifs, cf. demande explicite du user) — remis à 0
            # uniquement quand on avance réellement au set suivant, PAS à
            # chaque score=3 intercalé (contrairement à l'ancien
            # `consecutive_ones`, qui se remettait à 0 à tort dès un score=3
            # sans que le set n'ait avancé, cassant le calcul du seuil requis
            # ci-dessous et la règle d'arrêt "3 scores de 1 au sein du même
            # set, pas forcément consécutifs").
            ones_in_set = 0
            final_level = None
            last_sent_set = None
            ended = False
            # Distinct de `ended` : sert à n'envoyer `conversation_ended`
            # qu'UNE fois, dès que la fin est détectée (immédiatement, pas
            # seulement au turn_complete de l'au revoir de l'IA) — cf. bug
            # rapporté par le user : si l'étudiant clique sur le micro pour
            # "raccrocher" (comme l'IA le lui demande) avant que son tour
            # d'au revoir soit terminé, la connexion se fermait côté client
            # sans jamais avoir reçu le niveau final.
            ended_notified = False
            # Phrase déjà servie pour la question EN COURS, tant qu'elle n'a
            # pas encore été notée — cf. bug rapporté par le user : sans ça,
            # un double appel à `next_question` (le modèle hésitant/
            # rappelant l'outil par erreur) piochait deux phrases
            # différentes, et le modèle se corrigeait à voix haute en plein
            # énoncé. Remise à None dès qu'un score réel arrive (la question
            # est alors terminée, la prochaine devra être une VRAIE
            # nouvelle pioche).
            pending_phrase: dict | None = None
            # Strate (0/1/2) dont `pending_phrase` a été tirée — permet, une
            # fois la question notée, de mettre à jour `last_stratum` avec la
            # strate RÉELLEMENT utilisée (utile en cas de repli, cf.
            # _draw_from_strata) plutôt que la strate initialement visée.
            pending_phrase_stratum: int | None = None
            # Strate de la dernière question RÉELLEMENT posée dans le set
            # courant, et son score — pilotent le tirage adaptatif de la
            # prochaine question (cf. _draw_from_strata). Remis à None dès
            # qu'on avance à un nouveau set (1ère question d'un set = tirage
            # au hasard dans tout le set, cf. demande explicite du user).
            last_stratum: int | None = None
            last_score: int | None = None
            # True dès que l'étudiant a émis une quantité significative
            # d'audio (même seuil que MIN_TURN_BYTES, cf. transcribe_and_send)
            # DEPUIS que `pending_phrase` a été tiré — remis à False à chaque
            # nouvelle vraie pioche (jamais sur un `next_question` idempotent,
            # cf. commentaire sur `pending_phrase`). Sert de garde-fou contre
            # un `report_evaluation` prématuré (le modèle notant une question
            # avant que l'étudiant n'ait eu l'occasion d'y répondre) — cf. bug
            # rapporté par le user (une "seconde question" apparaît juste
            # après la première du test réel, avec un score fantôme
            # comptabilisé pour la première). Piloté par
            # REQUIRE_USER_AUDIO_BEFORE_SCORE ci-dessus.
            heard_user_audio_since_phrase = False
            # Horodatage du dernier appel (fresh OU idempotent) à
            # `next_question` — None tant que le vrai test n'a pas commencé
            # (le watchdog ne doit rien surveiller avant ça). Cf.
            # WATCHDOG_STALL_THRESHOLD_S plus haut.
            last_next_question_ts: float | None = None
            # Empêche de spammer plusieurs relances pour le MÊME blocage —
            # remis à False dès que le modèle rappelle `next_question`
            # (fresh ou idempotent), signe qu'il a repris la main.
            watchdog_nudged = False

            async def watchdog():
                nonlocal watchdog_nudged
                while not ended:
                    await asyncio.sleep(WATCHDOG_CHECK_INTERVAL_S)
                    if ended:
                        return
                    if last_next_question_ts is None or pending_phrase is not None or watchdog_nudged:
                        # Test réel pas encore commencé, question encore
                        # ouverte (reformulation en cours, attente normale),
                        # ou relance déjà envoyée pour ce blocage.
                        continue
                    if time.time() - last_next_question_ts > WATCHDOG_STALL_THRESHOLD_S:
                        watchdog_nudged = True
                        print(
                            f"{LOG_TAG} WATCHDOG : "
                            f"{time.time() - last_next_question_ts:.1f}s sans next_question, relance silencieuse"
                        )
                        await session.send_client_content(
                            turns=types.Content(role="user", parts=[types.Part.from_text(text=WATCHDOG_NUDGE_TEXT)]),
                            turn_complete=True,
                        )

            async def from_browser():
                nonlocal user_buffer, user_turn_start_ts, heard_user_audio_since_phrase
                try:
                    while not ended:
                        msg = await websocket.receive_json()
                        if msg.get("type") == "audio":
                            pcm_bytes = base64.b64decode(msg["data"])
                            if not user_buffer:
                                user_turn_start_ts = time.time()
                            user_buffer.extend(pcm_bytes)
                            if len(user_buffer) >= MIN_TURN_BYTES:
                                heard_user_audio_since_phrase = True
                            await session.send_realtime_input(
                                audio=types.Blob(data=pcm_bytes, mime_type="audio/pcm;rate=16000")
                            )
                except WebSocketDisconnect:
                    pass

            async def from_gemini():
                nonlocal user_buffer, user_turn_start_ts
                nonlocal current_set, mastered_level, threes_in_set, ones_in_set, final_level, last_sent_set, ended
                nonlocal pending_phrase, ended_notified, heard_user_audio_since_phrase
                nonlocal pending_phrase_stratum, last_stratum, last_score
                nonlocal last_next_question_ts, watchdog_nudged
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
                            if not ended_notified:
                                ended_notified = True
                                await safe_send(
                                    {"type": "conversation_ended", "level": final_level or mastered_level}
                                )
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
                            # explicite du user). Garde-fou partiel contre un
                            # double appel du modèle pour la même question
                            # (bug rapporté par le user, affichage "-") : au-
                            # delà des 3 phrases fixes connues, on ignore —
                            # imparfait (un doublon AVANT la 3e question
                            # resterait indétectable, faute d'un état "phrase
                            # ouverte" pour l'échauffement, contrairement au
                            # vrai test ci-dessous), mais sans risque puisque
                            # ces scores ne comptent jamais dans l'algorithme.
                            for score in warmup_new:
                                if len(warmup_scores) >= len(conversation_eval.WARMUP_PHRASES):
                                    continue
                                warmup_scores.append(score)
                                idx = len(warmup_scores)
                                french = conversation_eval.WARMUP_PHRASES[idx - 1]
                                await safe_send(
                                    {
                                        "type": "warmup_score",
                                        "score": score,
                                        "index": idx,
                                        "french": french,
                                    }
                                )

                            # Scores du vrai test : pilotent le set courant et
                            # la condition d'arrêt.
                            for score in real_new:
                                # Garde-fou contre un double appel de
                                # `report_evaluation` pour LA MÊME question
                                # (ex. le modèle note une réponse hésitante
                                # trop tôt puis note à nouveau après
                                # reformulation) — cf. bugs rapportés par le
                                # user (affichage "-", décalage score/
                                # question, fin de test prématurée par
                                # double-comptage). `pending_phrase` n'est
                                # non-None QUE tant que la question tirée par
                                # le dernier `next_question` n'a pas encore
                                # été notée ; un appel qui arrive alors qu'il
                                # est déjà à None n'a aucune question à
                                # laquelle s'attacher, donc pas de score fiable
                                # à en tirer — on l'ignore silencieusement
                                # (premier appel gagne, pas de rollback des
                                # compteurs pour un second appel, plus simple
                                # et plus sûr qu'une logique de correction).
                                # Garde-fou supplémentaire (cf.
                                # REQUIRE_USER_AUDIO_BEFORE_SCORE) : un
                                # `report_evaluation` qui arrive alors que
                                # l'étudiant n'a encore rien dit depuis que la
                                # phrase courante a été servie est ignoré —
                                # sans lui, un score prématuré (le modèle se
                                # trompant sur son propre état, typiquement
                                # juste après la transition vers le test réel)
                                # comptait à tort ET libérait `pending_phrase`,
                                # provoquant une "seconde question" inattendue.
                                if pending_phrase is None:
                                    continue
                                if REQUIRE_USER_AUDIO_BEFORE_SCORE and not heard_user_audio_since_phrase:
                                    continue
                                answered_french = pending_phrase["french"]
                                await safe_send(
                                    {
                                        "type": "score",
                                        "score": score,
                                        "set": current_set,
                                        "french": answered_french,
                                    }
                                )
                                # La question qui vient d'être notée est
                                # terminée : le prochain `next_question`
                                # devra vraiment piocher une nouvelle phrase.
                                # `last_stratum`/`last_score` retiennent la
                                # strate et le score de CETTE question pour
                                # piloter le tirage de la suivante (cf.
                                # _draw_from_strata).
                                last_stratum = pending_phrase_stratum
                                last_score = score
                                pending_phrase = None
                                pending_phrase_stratum = None
                                if score == 3:
                                    # "Au moins un score=3" suffit pour que ce
                                    # set compte comme maîtrisé dans le
                                    # rapport final, même s'il n'est pas
                                    # (encore) suffisant pour AVANCER au set
                                    # suivant. Seuil requis DYNAMIQUE selon le
                                    # nombre de score=1 déjà obtenus dans ce
                                    # même set — cf. demande explicite du
                                    # user : 2 scores=3 suffisent si moins de
                                    # 2 échecs dans le set, 3 scores=3 sont
                                    # nécessaires si exactement 2 échecs (au-
                                    # delà, la règle d'arrêt ci-dessous met
                                    # fin au test avant que ce seuil ne soit
                                    # même consulté).
                                    mastered_level = current_set
                                    threes_in_set += 1
                                    required_threes = 3 if ones_in_set == 2 else REQUIRED_THREES_PER_SET
                                    if threes_in_set >= required_threes:
                                        if current_set >= 11:
                                            final_level = 11
                                            ended = True
                                        else:
                                            current_set += 1
                                            threes_in_set = 0
                                            ones_in_set = 0
                                            # Nouveau set : 1ère question
                                            # tirée au hasard dans tout le
                                            # set, cf. demande explicite du
                                            # user.
                                            last_stratum = None
                                else:
                                    ones_in_set += 1
                                    if ones_in_set >= STOP_STREAK:
                                        final_level = mastered_level
                                        ended = True

                            # Envoie le niveau final DÈS que la fin est
                            # détectée, sans attendre que le tour d'au revoir
                            # de l'IA se termine — cf. bug rapporté par le
                            # user (l'étudiant cliquant sur le micro pour
                            # "raccrocher" fermait la connexion avant de
                            # jamais recevoir ce message).
                            if ended and not ended_notified:
                                ended_notified = True
                                await safe_send({"type": "conversation_ended", "level": final_level})

                            # `next_question` : le backend garde sa propre
                            # vérité (current_set) plutôt que de faire
                            # confiance aux arguments du modèle — cf. demande
                            # explicite du user. On répond quand même à
                            # CHAQUE appel du lot (protocole), y compris si
                            # `ended` vient de basculer à True dans ce même
                            # lot (réponse best-effort, la conversation se
                            # termine juste après).
                            for fc in next_question_calls:
                                # Le test vient de se terminer dans CE MÊME
                                # lot (score qui atteint le seuil ET
                                # next_question bundlés ensemble par le
                                # modèle, cf. demande explicite du user) :
                                # réponse vide plutôt que de piocher une
                                # VRAIE phrase — sinon le modèle l'annonçait
                                # à voix haute, et l'étudiant entendait une
                                # question fantôme juste après la fin du
                                # test, alors que la connexion est sur le
                                # point de se fermer. Le protocole reste
                                # respecté (une réponse est bien envoyée),
                                # elle n'a juste plus rien à dire.
                                if ended:
                                    await session.send_tool_response(
                                        function_responses=types.FunctionResponse(
                                            id=fc.id, name=fc.name, response={"french": "", "set": current_set}
                                        )
                                    )
                                    continue
                                # Le modèle a rappelé l'outil : il a repris la
                                # main, le watchdog peut se réarmer pour le
                                # prochain blocage éventuel.
                                last_next_question_ts = time.time()
                                watchdog_nudged = False
                                # Idempotent : tant qu'aucun score réel n'est
                                # arrivé depuis, un nouvel appel renvoie la
                                # MÊME phrase déjà servie, jamais une
                                # nouvelle pioche — cf. bug rapporté par le
                                # user.
                                if pending_phrase is None:
                                    strata = remaining_strata_by_set.get(current_set) or [[], [], []]
                                    pending_phrase, pending_phrase_stratum = _draw_from_strata(
                                        strata, last_stratum, last_score
                                    )
                                    print(
                                        f"{LOG_TAG} DRAW set={current_set} last_stratum={last_stratum} "
                                        f"last_score={last_score} -> stratum={pending_phrase_stratum} "
                                        f"phrase={(pending_phrase or {}).get('french')!r} "
                                        f"remaining_sizes={[len(s) for s in strata]}"
                                    )
                                    # Nouvelle vraie pioche : l'étudiant n'a
                                    # encore rien dit à propos d'ELLE, cf.
                                    # REQUIRE_USER_AUDIO_BEFORE_SCORE.
                                    heard_user_audio_since_phrase = False
                                    # Signal dédié, envoyé AVANT que l'IA ne
                                    # commence à prononcer cette question —
                                    # permet au frontend de distinguer "l'IA
                                    # parle pour donner son feedback" de
                                    # "l'IA énonce la question suivante" et
                                    # de figer/reprendre le flux en direct au
                                    # bon moment (cf. demande explicite du
                                    # user). Rien à signaler si le set est
                                    # épuisé (pending_phrase reste None).
                                    if pending_phrase is not None:
                                        await safe_send({"type": "question_started"})
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
                                    # Le niveau a déjà été envoyé dès sa
                                    # détection (cf. plus haut) — on laisse
                                    # juste le tour de parole EN COURS de
                                    # l'IA se terminer avant de couper, pour
                                    # ne pas l'interrompre en plein mot
                                    # (l'IA n'a plus son mot à dire sur la
                                    # fin elle-même, cf. règle 7 du prompt).
                                    # Fermer la socket ICI (pas seulement
                                    # dans le finally englobant) : sinon
                                    # from_browser reste bloqué sur son
                                    # receive_json() en attente, empêchant le
                                    # TaskGroup de jamais se terminer.
                                    if not ended_notified:
                                        ended_notified = True
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
                tg.create_task(watchdog())

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
