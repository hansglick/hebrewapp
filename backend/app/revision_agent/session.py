"""Socle commun aux tâches : relais audio navigateur ↔ prof (Gemini Live) et affichage de ses prises de parole.

Le prof ne parle qu'hébreu : chacune de ses prises de parole est transcrite par Gemini Live, traduite phrase par
phrase (translate.py) puis affichée — seule la dernière reste à l'écran. Ce que dit l'élève n'est jamais affiché.

Navigateur → backend : trames binaires = micro, PCM16 mono 24 kHz ; JSON {"type": "stop"}.
Backend → navigateur : trames binaires = voix du prof, PCM16 mono 24 kHz ; JSON :
  {"type": "status", "state": "live" | "ended"}
  {"type": "teacher", "id": int, "seq": int, "hebrew": str, "french": str}
        (prise de parole du prof, complétée sur place tant que id ne change pas ; seq ordonne les envois)
  {"type": "interrupt"}                                 (jeter l'audio du prof en attente)
  {"type": "error", "text": str}
  + les messages propres à chaque tâche (cf. reading.py, comprehension.py).
"""

import array
import asyncio
import json
import logging
import math
import re
import time
from dataclasses import dataclass, field

from fastapi import WebSocket, WebSocketDisconnect

from app.revision_agent.config import SAMPLE_RATE
from app.revision_agent.gemini_live import GeminiLive, LiveEvent
from app.revision_agent.translate import translate_to_french

log = logging.getLogger("revision_agent.session")

BYTES_PER_SECOND = SAMPLE_RATE * 2
TEACHER_RMS = 150  # le flux audio du prof peut être continu : en dessous, c'est du silence
# La transcription d'une prise de parole arrive bien avant la fin de l'audio : on la traduit dès qu'elle marque une pause.
UTTERANCE_GAP_SECONDS = 0.4  # pause de transcription après laquelle le texte reçu est traduit et affiché
TURN_GAP_SECONDS = 2.0  # sans fin de tour signalée : pause qui clôt la prise de parole
SENTENCE_END = re.compile(r"[.!?]")


@dataclass
class TeacherTurn:
    """Une prise de parole du prof, découpée en phrases traduites une à une puis affichées dans l'ordre."""
    id: int
    text: str = ""  # transcription reçue jusqu'ici
    cut: int = 0  # position dans text jusqu'à laquelle les phrases sont parties à la traduction
    segments: list[dict] = field(default_factory=list)  # {"he": str, "fr": str | None}, dans l'ordre
    published: int = 0  # nombre de segments déjà affichés
    open: bool = True
    shown: bool = True  # faux : prononcée mais jamais affichée (ex. question d'exercice, déjà affichée à part)


def rms(pcm: bytes) -> float:
    samples = array.array("h")
    samples.frombytes(pcm[: len(pcm) // 2 * 2])
    if not samples:
        return 0.0
    return math.sqrt(sum(s * s for s in samples) / len(samples))


class TeacherSession:
    """Une séance avec le prof ; chaque tâche complète les points d'extension on_* et tick."""

    def __init__(self, browser: WebSocket, live: GeminiLive):
        self.browser = browser
        self.live = live
        self.browser_lock = asyncio.Lock()
        self.started_at: float | None = None
        # Position estimée de la lecture audio côté navigateur, et fin de la dernière parole audible du prof.
        self.playback_until = 0.0
        self.teacher_until = 0.0
        # Prise de parole du prof en cours, traduite et affichée phrase par phrase.
        self.turn = TeacherTurn(id=0, open=False)
        self.turn_text_at = 0.0
        self.teacher_seq = 0
        self.hidden_turn = False  # la prochaine prise de parole du prof ne sera pas affichée
        self.background: list[asyncio.Task] = []  # tâches propres à la séance, annulées à la fin

    # --- envois vers le navigateur ------------------------------------------

    async def to_browser(self, message: dict | bytes) -> None:
        async with self.browser_lock:
            try:
                if isinstance(message, bytes):
                    await self.browser.send_bytes(message)
                else:
                    await self.browser.send_json(message)
            except (WebSocketDisconnect, RuntimeError):
                pass

    # --- cycle de vie -------------------------------------------------------

    async def run(self) -> None:
        await self.live.connect()
        tasks = [asyncio.create_task(self.pump_browser()), asyncio.create_task(self.watch()),
                 asyncio.create_task(self.pump_live())]
        try:
            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                if task.exception():
                    log.error("Tâche de séance en échec", exc_info=task.exception())
        finally:
            for task in tasks + self.background:
                if not task.done():
                    task.cancel()
            try:
                await self.live.close()
            except Exception:
                log.exception("Fermeture de la session live")
        await self.to_browser({"type": "status", "state": "ended"})

    # --- navigateur → prof --------------------------------------------------

    async def pump_browser(self) -> None:
        while True:
            message = await self.browser.receive()
            if message["type"] == "websocket.disconnect":
                return
            if message.get("bytes") is not None:
                if self.started_at is not None:
                    await self.on_microphone(message["bytes"])
            elif message.get("text"):
                data = json.loads(message["text"])
                if data.get("type") == "stop":
                    return
                await self.on_browser_message(data)

    async def on_microphone(self, pcm: bytes) -> None:
        await self.live.send_audio(pcm)

    # --- prof → navigateur --------------------------------------------------

    async def pump_live(self) -> None:
        async for event in self.live.events():
            await self.on_event(event)

    async def on_event(self, event: LiveEvent) -> None:
        now = time.monotonic()
        if event.kind == "audio":
            await self.on_teacher_audio(event.data, now)
        elif event.kind == "agent_text":
            self.on_agent_text(event.data, now)
        elif event.kind == "user_text":
            log.info("élève : %s", event.data)
            await self.on_user_text(event.data)
        elif event.kind == "turn_complete":
            log.info("fin du tour du prof")
            self.end_turn()
        elif event.kind == "tool_call":
            log.info("fonction %s %s", event.data["name"], event.data["args"])
            await self.on_tool_call(event.data)
        elif event.kind == "interrupted":
            # Gemini a détecté de la parole côté élève pendant que le prof parlait.
            log.info("prof interrompu")
            self.end_turn()
            self.playback_until = self.teacher_until = now
            await self.to_browser({"type": "interrupt"})
        elif event.kind == "started":
            self.started_at = now
            # Ouvre la connexion de traduction avant la première prise de parole du prof.
            self.background.append(asyncio.create_task(translate_to_french("שָׁלוֹם")))
            await self.to_browser({"type": "status", "state": "live"})
            await self.on_started()
        elif event.kind == "error":
            log.warning("Erreur du modèle live : %s", event.data)
            await self.to_browser({"type": "error", "text": event.data})

    async def on_teacher_audio(self, pcm: bytes, now: float) -> None:
        self.playback_until = max(self.playback_until, now) + len(pcm) / BYTES_PER_SECOND
        if rms(pcm) > TEACHER_RMS:
            self.teacher_until = self.playback_until
        await self.to_browser(pcm)

    def on_agent_text(self, text: str, now: float) -> None:
        if not self.turn.open:
            self.turn = TeacherTurn(id=self.turn.id + 1, shown=not self.hidden_turn)
            self.hidden_turn = False
            if not self.turn.shown:
                self.background.append(asyncio.create_task(self.on_hidden_turn_started()))
        turn = self.turn
        turn.text += text
        self.turn_text_at = now
        # Une ou plusieurs phrases viennent de se terminer : on les traduit sans attendre la pause.
        ends = [m.end() for m in SENTENCE_END.finditer(turn.text, turn.cut)]
        if ends:
            self.queue_segment(ends[-1])

    # Points d'extension des tâches.
    async def on_started(self) -> None: ...

    async def on_user_text(self, text: str) -> None: ...

    async def on_browser_message(self, data: dict) -> None: ...

    async def on_hidden_turn_started(self) -> None:
        """Le prof commence la prise de parole marquée par hidden_turn."""

    async def on_tool_call(self, call: dict) -> None:
        await self.live.tool_response(call["id"], call["name"], {"erreur": "fonction inconnue"})

    async def tick(self, now: float) -> None: ...

    # --- traduction et affichage des prises de parole du prof -----------------

    def queue_segment(self, end: int | None = None) -> None:
        """Envoie à la traduction la suite de la prise de parole, jusqu'à end (par défaut, tout ce qui est reçu)."""
        turn = self.turn
        end = len(turn.text) if end is None else end
        hebrew, turn.cut = turn.text[turn.cut:end], end
        if not hebrew.strip():
            return
        has_words = any(c.isalnum() for c in hebrew)
        if has_words:
            log.info("prof : %s", hebrew.strip())
        if not turn.shown:
            return  # rien à traduire ni à afficher
        segment = {"he": hebrew, "fr": None if has_words else ""}  # une simple pause (« ... ») n'a rien à traduire
        turn.segments.append(segment)
        if has_words:
            self.background.append(asyncio.create_task(self.translate_segment(turn, segment)))

    def end_turn(self) -> None:
        if self.turn.open and self.turn.cut < len(self.turn.text):
            self.queue_segment()
        self.turn.open = False

    async def translate_segment(self, turn: TeacherTurn, segment: dict) -> None:
        try:
            segment["fr"] = await translate_to_french(segment["he"].strip())
        except Exception:
            log.exception("Traduction impossible")
            segment["fr"] = ""
        await self.publish_turn(turn)

    async def publish_turn(self, turn: TeacherTurn) -> None:
        """Affiche les phrases traduites, dans l'ordre : l'hébreu n'apparaît qu'avec sa traduction, rien ne change ensuite."""
        if turn is not self.turn:
            return  # une prise de parole plus récente est déjà affichée
        ready = 0
        while ready < len(turn.segments) and turn.segments[ready]["fr"] is not None:
            ready += 1
        if ready <= turn.published:
            return
        turn.published = ready
        segments = turn.segments[:ready]
        self.teacher_seq += 1
        await self.to_browser({
            "type": "teacher", "id": turn.id, "seq": self.teacher_seq,
            "hebrew": "".join(seg["he"] for seg in segments).strip(),
            "french": " ".join(seg["fr"].strip() for seg in segments if seg["fr"].strip()),
        })

    async def watch(self) -> None:
        while True:
            await asyncio.sleep(0.1)
            if self.started_at is None:
                continue
            now = time.monotonic()
            if self.turn.open:
                if self.turn.cut < len(self.turn.text) and now - self.turn_text_at >= UTTERANCE_GAP_SECONDS:
                    self.queue_segment()
                if now - self.turn_text_at >= TURN_GAP_SECONDS:
                    self.end_turn()
            await self.tick(now)
