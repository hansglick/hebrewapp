"""Mode texte, lecture avec le tri lecture / question (FAST, SHARP, cf. demande explicite du user) : la réponse que
l'élève enregistre est transcrite pendant qu'il parle, par Gemini Transcribe Live (Live API). Sa transcription
s'affiche en direct (on_text), et la transcription finale arrive peu après la fin de l'enregistrement (0,4 s, vérifié),
au lieu d'être faite d'un bloc, après coup (cf. transcribe.transcribe, le repli si celle-ci échoue).

Le micro capte en 24 kHz (cf. audio.js) ; le modèle veut du 16 kHz. Une pause de l'élève clôt un segment : sa
transcription finale (input_transcription) s'ajoute aux précédentes, la partielle (interim_input_transcription) est
celle du segment en cours."""

import asyncio
import logging

import numpy as np
from google import genai
from google.genai import types

from app.config import GEMINI_API_KEY
from app.revision_agent.config import LIVE_TRANSCRIBE_MODEL

log = logging.getLogger("revision_agent.live_transcribe")

FINAL_TIMEOUT_SECONDS = 3.0  # attente de la transcription finale, une fois l'enregistrement fini
CONFIG = types.LiveConnectConfig(
    response_modalities=["TEXT"],
    input_audio_transcription=types.AudioTranscriptionConfig(language_codes=["he-IL"]),
)

_client: genai.Client | None = None


def to_16k(pcm: bytes) -> bytes:
    """Un bloc PCM16 mono 24 kHz, rééchantillonné en 16 kHz."""
    samples = np.frombuffer(pcm, dtype=np.int16)
    if not len(samples):
        return b""
    return np.interp(np.arange(0, len(samples), 1.5), np.arange(len(samples)), samples).astype(np.int16).tobytes()


class LiveTranscriber:
    """Un enregistrement de l'élève : feed reçoit ses blocs (le pré-enregistrement compris, cf. audio.Recorder) dès le
    début, finish rend sa transcription ; vide si la Live API a échoué."""

    def __init__(self, on_text):
        self.on_text = on_text
        self.queue: asyncio.Queue[bytes | None] = asyncio.Queue()
        self.done = ""  # les segments finis
        self.pending = ""  # le segment en cours, transcription partielle
        self.ended = False  # l'enregistrement est fini
        self.final = asyncio.Event()  # la transcription finale du dernier segment est arrivée
        self.failed = False
        self.task = asyncio.create_task(self.run())

    @property
    def text(self) -> str:
        return " ".join(part for part in (self.done, self.pending) if part)

    def feed(self, pcm: bytes) -> None:
        if not self.ended:
            self.queue.put_nowait(pcm)

    async def finish(self) -> str:
        """La fin de l'enregistrement : la transcription, une fois la finale arrivée (ou FINAL_TIMEOUT_SECONDS)."""
        self.ended = True
        self.queue.put_nowait(None)
        await self.task
        return "" if self.failed else self.text

    def cancel(self) -> None:
        self.ended = True
        self.task.cancel()

    async def run(self) -> None:
        global _client
        _client = _client or genai.Client(api_key=GEMINI_API_KEY)
        try:
            async with _client.aio.live.connect(model=LIVE_TRANSCRIBE_MODEL, config=CONFIG) as session:
                receiver = asyncio.create_task(self.receive(session))
                try:
                    while (pcm := await self.queue.get()) is not None:
                        await session.send_realtime_input(
                            audio=types.Blob(data=to_16k(pcm), mime_type="audio/pcm;rate=16000"))
                    await session.send_realtime_input(audio_stream_end=True)
                    # Plus rien en cours (l'élève s'est tu avant de lâcher) : rien à attendre.
                    if self.pending:
                        try:
                            await asyncio.wait_for(self.final.wait(), FINAL_TIMEOUT_SECONDS)
                        except TimeoutError:
                            log.warning("transcription finale en retard, gardée partielle : %s", self.pending)
                finally:
                    receiver.cancel()
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("transcription en direct impossible")
            self.failed = True

    async def receive(self, session) -> None:
        # receive() s'arrête à chaque fin de tour : on l'écoute tant que la session dure.
        while True:
            async for response in session.receive():
                content = response.server_content
                if not content:
                    continue
                if (interim := content.interim_input_transcription) and interim.text:
                    self.pending = interim.text.strip()
                    await self.on_text(self.text)
                if (final := content.input_transcription) and final.text:
                    self.done, self.pending = " ".join(p for p in (self.done, final.text.strip()) if p), ""
                    await self.on_text(self.text)
                    if self.ended:
                        self.final.set()
