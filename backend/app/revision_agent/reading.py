"""Tâche « Lecture » : le prof fait lire un court passage à voix haute, puis la lecture est évaluée.

L'évaluation est faite hors du modèle live (reading_audit.py : extracteur, puis évaluateur) ; le prof ne la
commente pas, seule la carte de verdict s'affiche. Pendant la lecture, le prof n'entend rien et il est coupé.

Messages propres à la tâche (backend → navigateur, en plus de ceux de session.py) :
  {"type": "phase", "phase": "greeting" | "instruction" | "reading" | "verdict" | "done"}
  {"type": "passage", "lesson": str, "hebrew": [str], "french": [str]}
  {"type": "verdict", "verdict": {...}}                 (audio = WAV de la lecture en data URL, pour la réécouter)
"""

import asyncio
import base64
import logging
import time

from fastapi import WebSocket

from app.revision_agent import prompts
from app.revision_agent.config import SAMPLE_RATE, SILENCE_SECONDS
from app.revision_agent.gemini_live import GeminiLive
from app.revision_agent.passages import sample_passage
from app.revision_agent.reading_audit import evaluate_reading, to_wav
from app.revision_agent.session import BYTES_PER_SECOND, TEACHER_RMS, TeacherSession, rms

log = logging.getLogger("revision_agent.reading")

VOICE_RMS = 700  # niveau micro (PCM16) au-delà duquel on considère que l'élève parle
PREROLL_BYTES = BYTES_PER_SECOND  # audio gardé avant la première détection de voix de l'élève
TAIL_BYTES = BYTES_PER_SECOND // 2  # silence gardé après sa dernière détection
PASSAGE_FALLBACK_SECONDS = 60  # si le prof n'a toujours pas demandé le texte
TEACHER_RESUME_SECONDS = 1.5  # pendant la lecture : le prof qui reparle après ce silence est coupé

PASSAGE_TOOL = {
    "name": "afficher_texte_lecture",
    "description": "Choisit les phrases que l'élève doit lire et les affiche à son écran (le texte n'est pas renvoyé).",
    # Non bloquante : sa réponse peut être marquée SILENT, pour que le prof ne l'annonce pas.
    "behavior": "NON_BLOCKING",
}


class ReadingSession(TeacherSession):
    def __init__(self, browser: WebSocket, voice: str, lessons: list[str]):
        super().__init__(browser, GeminiLive(voice, prompts.READING_INSTRUCTIONS, prompts.READING_START, [PASSAGE_TOOL]))
        self.lesson, self.hebrew, self.french = sample_passage(lessons)
        self.phase = "greeting"
        self.passage_at: float | None = None
        # Enregistrement de la lecture : du premier son de l'élève (avec un peu d'avance) au silence final.
        self.preroll = bytearray()
        self.recording = bytearray()
        self.voice_end = 0  # position, dans recording, de la fin de la dernière voix détectée
        self.last_student_voice = 0.0
        # Pendant la lecture, une fois la consigne finie, le prof est coupé : ni entendu, ni affiché, ni pris pour l'élève.
        self.teacher_muted = False
        self.teacher_loud_at = 0.0  # réception du dernier audio audible du prof

    async def set_phase(self, phase: str) -> None:
        if phase != self.phase:
            log.info("phase %s → %s", self.phase, phase)
            self.phase = phase
            await self.to_browser({"type": "phase", "phase": phase})

    async def on_started(self) -> None:
        await self.to_browser({"type": "phase", "phase": self.phase})
        log.info("Séance de lecture lancée · voix %s · passage de la leçon %s", self.live.voice, self.lesson)

    # --- micro de l'élève ---------------------------------------------------

    async def on_microphone(self, pcm: bytes) -> None:
        if self.phase == "reading":
            self.record(pcm)
        # Le prof n'entend ni la lecture ni l'attente du résultat : sinon il l'évalue lui-même.
        # Le flux continue avec du silence.
        if self.phase in ("reading", "verdict"):
            pcm = bytes(len(pcm))
        await self.live.send_audio(pcm)

    def record(self, pcm: bytes) -> None:
        now = time.monotonic()
        is_voice = now > self.teacher_until and rms(pcm) > VOICE_RMS
        if not self.recording and not is_voice:
            self.preroll = (self.preroll + pcm)[-PREROLL_BYTES:]
            return
        if not self.recording:
            self.recording.extend(self.preroll)
        self.recording.extend(pcm)
        if is_voice:
            self.voice_end = len(self.recording)
            self.last_student_voice = now

    # --- le prof ------------------------------------------------------------

    async def on_teacher_audio(self, pcm: bytes, now: float) -> None:
        loud = rms(pcm) > TEACHER_RMS
        if loud and self.phase == "reading" and now - self.teacher_loud_at >= TEACHER_RESUME_SECONDS:
            self.mute_teacher("il reprend la parole")
        if self.teacher_muted:
            return
        if loud:
            self.teacher_loud_at = now
        await super().on_teacher_audio(pcm, now)

    def on_agent_text(self, text: str, now: float) -> None:
        if self.teacher_muted:
            log.info("prof coupé : %s", text)
            return
        super().on_agent_text(text, now)

    async def on_user_text(self, text: str) -> None:
        if self.phase == "greeting":
            await self.set_phase("instruction")

    def end_turn(self) -> None:
        super().end_turn()
        if self.phase == "reading":
            self.mute_teacher("consigne terminée")

    def mute_teacher(self, reason: str) -> None:
        if not self.teacher_muted:
            log.info("prof coupé jusqu'à la fin de la lecture (%s)", reason)
            self.teacher_muted = True

    async def on_tool_call(self, call: dict) -> None:
        if call["name"] != PASSAGE_TOOL["name"]:
            return await super().on_tool_call(call)
        if self.passage_at is None:
            await self.show_passage(call["id"])
        else:
            await self.live.tool_response(call["id"], call["name"], {"consigne": prompts.PASSAGE_ALREADY_SHOWN})

    async def show_passage(self, call_id: str | None) -> None:
        """Affiche le texte ; le prof en est seulement informé (call_id None = envoi spontané, sans appel du prof)."""
        self.passage_at = time.monotonic()
        await self.set_phase("reading")
        await self.to_browser({"type": "passage", "lesson": self.lesson, "hebrew": self.hebrew, "french": self.french})
        # Le texte lui-même n'est jamais transmis au prof : il ne doit pas le lire à voix haute.
        if call_id is None:
            await self.live.note(prompts.PASSAGE_SHOWN)
        else:
            await self.live.tool_response(call_id, PASSAGE_TOOL["name"], {"consigne": prompts.PASSAGE_SHOWN}, silent=True)

    # --- fin de lecture et évaluation ---------------------------------------

    async def tick(self, now: float) -> None:
        if self.passage_at is None and now - self.started_at > PASSAGE_FALLBACK_SECONDS:
            log.info("pas de demande de texte : envoi spontané")
            await self.show_passage(None)
        elif self.phase == "reading" and self.recording and now - self.last_student_voice >= SILENCE_SECONDS:
            await self.end_of_reading()

    async def end_of_reading(self) -> None:
        reading = bytes(self.recording[: self.voice_end + TAIL_BYTES])
        log.info("fin de lecture : %.1f s enregistrées", len(reading) / BYTES_PER_SECOND)
        self.teacher_muted = False
        await self.set_phase("verdict")
        # Le prof remercie l'élève, s'il ne l'a pas déjà fait de lui-même.
        if self.teacher_until < self.last_student_voice:
            await self.live.app_message(prompts.READING_DONE)
        self.background.append(asyncio.create_task(self.evaluate(reading)))

    async def evaluate(self, reading: bytes) -> None:
        started = time.monotonic()
        try:
            evaluation = await evaluate_reading(self.hebrew, reading, SAMPLE_RATE)
        except Exception:
            log.exception("Évaluation de la lecture impossible")
            await self.to_browser({"type": "error", "text": "L’évaluation de la lecture a échoué."})
            await self.live.app_message(prompts.EVALUATION_FAILED)
            await self.set_phase("done")
            return
        log.info("évaluation en %.1f s (extraction %.1f s, évaluation %.1f s) : %s", time.monotonic() - started,
                 evaluation.extraction_seconds, evaluation.evaluation_seconds, evaluation.verbatim)
        # Pas d'enregistrement sur disque (Render) : la lecture repart au navigateur pour être réécoutée.
        audio = "data:audio/wav;base64," + base64.b64encode(to_wav(reading, SAMPLE_RATE)).decode()
        await self.to_browser({"type": "verdict", "verdict": {
            "lesson": self.lesson,
            "passage": self.hebrew,
            "verbatim": evaluation.verbatim,
            "remarks": [e.model_dump() for e in evaluation.errors],
            "timing": {"extraction": evaluation.extraction_seconds, "evaluation": evaluation.evaluation_seconds},
            "audio": audio,
        }})
        await self.set_phase("done")
