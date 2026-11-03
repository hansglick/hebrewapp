"""Socle commun aux tâches : relais audio navigateur ↔ prof (Gemini Live) et affichage de ses prises de parole.

Le prof ne parle qu'hébreu : chacune de ses prises de parole est transcrite par Gemini Live, traduite phrase par
phrase (translate.py) puis affichée — seule la dernière reste à l'écran. Ce que dit l'élève n'est jamais affiché.

Navigateur → backend : trames binaires = micro, PCM16 mono 24 kHz ; JSON {"type": "stop"},
  {"type": "student_text", "text": str} (mode texte : la réponse écrite de l'élève, cf. text_teacher.py),
  {"type": "student_audio", "audio": str} (mode texte : sa réponse enregistrée, WAV en base64, cf. transcribe.py).
Backend → navigateur : trames binaires = voix du prof, PCM16 mono 24 kHz ; JSON :
  {"type": "status", "state": "live" | "ended"}
  {"type": "bill", "bill": {"seconds", "models": [{"model", "input_tokens", "output_tokens", "input_cost",
                                                   "output_cost"}]}}   (fin de séance)
  {"type": "teacher", "id": int, "seq": int, "hebrew": str, "french": str}
        (prise de parole du prof, complétée sur place tant que id ne change pas ; seq ordonne les envois)
  {"type": "interrupt"}                                 (jeter l'audio du prof en attente)
  {"type": "error", "text": str}
  {"type": "transcript", "text": str, "phonetic": str}   (mode texte : la transcription de la réponse enregistrée, et
                                                         sa prononciation entendue, double route voyelle)
  {"type": "exchange", "kind": "evaluation" | "conversation", "evaluation"?: {"answer", "errors"}}
                                                        (mode texte : ce que le prof fait de la dernière réponse de
                                                         l'élève : il l'évalue (l'évaluation suit, une fois jugée), ou
                                                         lui répond sans l'évaluer)
  + les messages propres à chaque tâche (cf. reading.py, comprehension.py).
"""

import array
import asyncio
import base64
import json
import logging
import math
import re
import time
import wave
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from fastapi import WebSocket, WebSocketDisconnect

from app.revision_agent.config import DEBUG_STUDENT_AUDIO, SAMPLE_RATE
from app.revision_agent.gemini_live import GeminiLive, LiveEvent
from app.revision_agent.journal import SKIPPED_BROWSER_MESSAGES, SessionJournal
from app.revision_agent.judges import faults, judged_note, mispronounced
from app.revision_agent.transcribe import TEACHER_CONTEXT, heard_phonetic, in_hebrew_letters, respelled, transcribe
from app.revision_agent.translate import FLASH_USAGE, flash_bill, french_speech, translate_to_french

log = logging.getLogger("revision_agent.session")

BYTES_PER_SECOND = SAMPLE_RATE * 2
TEACHER_RMS = 150  # le flux audio du prof peut être continu : en dessous, c'est du silence
# La transcription d'une prise de parole arrive bien avant la fin de l'audio : on la traduit dès qu'elle marque une pause.
UTTERANCE_GAP_SECONDS = 0.4  # pause de transcription après laquelle le texte reçu est traduit et affiché
TURN_GAP_SECONDS = 2.0  # sans fin de tour signalée : pause qui clôt la prise de parole
# Fin de la séance, toutes tâches (cf. demande explicite du user) : la tâche terminée (« phase » « done »), la connexion
# se ferme d'elle-même ce délai après l'au revoir du prof (texte affiché, audio joué), ou au plus tard FINISH_TIMEOUT
# après la fin de la tâche, s'il ne dit rien.
FINISH_GRACE_SECONDS = 1.5
FINISH_TIMEOUT = 45
SENTENCE_END = re.compile(r"[.!?]")
SENTENCE = re.compile(r"[^.!?]*[.!?]+|[^.!?]+$")
NIKKUD = re.compile("[֑-ׇ]")
HEBREW_LETTER = re.compile(r"[א-ת]")
HEBREW_WORD = re.compile(r"[א-ת]+")
LATIN_LETTER = re.compile(r"[A-Za-zÀ-ÿ]")
# Diagnostic de la voix de l'élève (cf. config.DEBUG_STUDENT_AUDIO).
STUDENT_RMS = 300  # au-dessus : l'élève parle
STUDENT_GAP_SECONDS = 0.3  # silence qui clôt un segment de voix
DEBUG_AUDIO_SECONDS = 20  # durée du micro enregistrée à chaque évaluation
DEBUG_AUDIO_DIR = Path(__file__).resolve().parents[2] / "results" / "revision_debug"


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
    hidden: str = ""  # masquée parce qu'elle pose cette question : seules les phrases qui la répètent sont masquées


def repeats(sentence: str, question: str) -> bool:
    """La phrase reprend la question : plus de la moitié de ses mots hébreux (sans voyelles) en viennent."""
    words = HEBREW_WORD.findall(NIKKUD.sub("", sentence))
    asked = set(HEBREW_WORD.findall(NIKKUD.sub("", question)))
    return bool(words) and sum(word in asked for word in words) * 2 > len(words)


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
        self.recent_said: list[str] = []  # dernières prises de parole du prof, contexte de la transcription
        # Mode texte, « double route voyelle » (cf. reading.py) : modèle de la transcription phonétique de la réponse
        # enregistrée, et sa dernière transcription.
        self.phonetic_model: str | None = None
        # Traductions déjà faites (l'accueil enregistré, cf. intros.py) : {prise de parole: {"french", "hebrew",
        # "spoken"}}, affichées sans attendre la traduction.
        self.known_translations: dict[str, dict] = {}
        self.audio_phonetic = ""
        self.pronunciation_model: str | None = None  # double route voyelle : le juge de la prononciation
        self.pronunciation: asyncio.Task | None = None  # mots mal prononcés de la dernière réponse orale
        self.turn_text_at = 0.0
        self.teacher_seq = 0
        self.hidden_turn = False  # la prochaine prise de parole du prof ne sera pas affichée
        self.hidden_text = ""  # … sauf ce qui ne répète pas ce texte (la question posée, cf. TeacherTurn.hidden)
        self.background: list[asyncio.Task] = []  # tâches propres à la séance, annulées à la fin
        self.session_over = asyncio.Event()  # la tâche est terminée : la séance se ferme d'elle-même
        self.done_at = 0.0  # fin de la tâche (cf. check_finished)
        self.done_turn = 0  # dernière prise de parole du prof avant son au revoir
        self.quiet_since = 0.0  # le prof s'est tu après son au revoir
        # Mode texte : la dernière réponse de l'élève attend que le prof l'évalue ou lui réponde (cf. « exchange »).
        self.exchange_open = False
        self.exchange_evaluated = False  # le prof l'évalue : l'évaluation suivra
        # Diagnostic : micro récent, et segment de voix de l'élève en cours (début, dernier instant audible).
        self.mic = bytearray()
        self.voice: tuple[float, float] | None = None
        self.journal: SessionJournal | None = None  # journal de la séance, branché par le routeur (cf. attach)

    def attach(self, journal: SessionJournal) -> None:
        self.journal = self.live.journal = journal

    # --- envois vers le navigateur ------------------------------------------

    async def to_browser(self, message: dict | bytes) -> None:
        if isinstance(message, dict) and message.get("type") == "phase" and message.get("phase") == "done":
            # La tâche est terminée : le prof dit au revoir, puis la séance se ferme (cf. check_finished).
            self.done_at = self.done_at or time.monotonic()
            self.done_turn = self.done_turn or self.turn.id
        async with self.browser_lock:
            try:
                if isinstance(message, bytes):
                    await self.browser.send_bytes(message)
                else:
                    if self.journal and message.get("type") not in SKIPPED_BROWSER_MESSAGES:
                        self.journal.write("to_browser", message=message)
                    await self.browser.send_json(message)
            except (WebSocketDisconnect, RuntimeError):
                pass

    # --- cycle de vie -------------------------------------------------------

    async def run(self) -> None:
        # Tokens des modèles Flash de la séance (traduction, jugements), comptés pour la facture.
        flash_usage = {}
        FLASH_USAGE.set(flash_usage)
        await self.live.connect()
        tasks = [asyncio.create_task(self.pump_browser()), asyncio.create_task(self.watch()),
                 asyncio.create_task(self.pump_live()), asyncio.create_task(self.session_over.wait())]
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
        # Facture de la séance (cf. demande explicite du user) : tokens et prix de chaque modèle (le prof, puis les
        # modèles Flash), durée de la conversation.
        bill = {"models": [self.live.bill(), *flash_bill(flash_usage)],
                "seconds": round(time.monotonic() - self.started_at) if self.started_at else 0}
        log.info("facture : %s", bill)
        await self.to_browser({"type": "bill", "bill": bill})
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
                if self.journal:
                    self.journal.write("from_browser", message=data)
                if data.get("type") == "stop":
                    return
                if data.get("type") == "student_text":
                    # Mode texte (cf. text_teacher.py) : la réponse écrite de l'élève, traitée comme sa transcription ;
                    # corrected : la transcription de sa dernière réponse orale, corrigée à la main (cf. StudentAnswer).
                    corrected = bool(data.get("corrected"))
                    await self.on_student_text(str(data.get("text") or "").strip(), corrected, corrected)
                    continue
                if data.get("type") == "student_audio":
                    # Mode texte : la réponse enregistrée, transcrite puis traitée comme une réponse écrite.
                    self.background.append(asyncio.create_task(self.on_student_audio(str(data.get("audio") or ""))))
                    continue
                await self.on_browser_message(data)

    async def on_microphone(self, pcm: bytes) -> None:
        if DEBUG_STUDENT_AUDIO:
            self.track_voice(pcm)
        await self.live.send_audio(pcm)

    async def exchange(self, evaluation: dict | None) -> None:
        """Mode texte : l'évaluation de la réponse de l'élève, réussie ou non, dans la fenêtre de sa réponse (expression
        libre, compréhension, cf. StudentAnswer) ; None : l'évaluation demandée par le prof n'a pas lieu (pas
        d'exercice en cours, pas une réponse à la question) : il converse."""
        if self.exchange_evaluated:
            self.exchange_evaluated = False
            await self.to_browser({"type": "exchange", "kind": "evaluation", "evaluation": evaluation} if evaluation
                                  else {"type": "exchange", "kind": "conversation"})

    async def on_student_text(self, text: str, spoken: bool = False, corrected: bool = False) -> None:
        if text and self.started_at is not None:
            await self.on_event(LiveEvent("user_text", f"{text} "))
            self.exchange_open, self.exchange_evaluated = True, False
            # Double route voyelle : la prononciation entendue, pas pour une réponse corrigée à la main.
            phonetic = self.audio_phonetic if spoken and not corrected else ""
            self.audio_phonetic = ""
            # Ses fautes de prononciation sont relevées à part, pendant que le prof l'évalue (cf. pronunciation_errors).
            self.pronunciation = (asyncio.create_task(mispronounced(text, phonetic, self.pronunciation_model))
                                  if phonetic and self.pronunciation_model else None)
            await self.live.student_text(text, spoken, corrected, phonetic)

    async def pronunciation_errors(self) -> list[dict]:
        """Double route voyelle : les fautes de prononciation de la réponse évaluée (cf. judges.mispronounced), et la
        forme courante de l'hébreu parlé (cf. judges.VERDICT), une simple remarque, comme en lecture (cf. demande
        explicite du user) ; aucune sans double route."""
        task, self.pronunciation = self.pronunciation, None
        found = await task if task else []
        return (faults([f for f in found if not f["remarque"]], "pronunciation")
                + faults([f for f in found if f["remarque"]], "note"))

    async def tell_judged(self, errors: list[dict]) -> None:
        """Les fautes relevées par un juge à part (sens, prononciation), signalées au prof pour qu'il puisse en parler
        (cf. judges.judged_note)."""
        if note := judged_note(errors):
            await self.live.note(note)

    def phonetic_wanted(self) -> bool:
        """La réponse enregistrée est aussi transcrite en lettres latines, pour le prof (expression libre,
        compréhension) ; en lecture, pour la comparaison (cf. ReadingSession)."""
        return self.phonetic_model is not None

    def reading_intent(self, text: str) -> bool | None:
        """Lecture, mode texte : la réponse est-elle une lecture (cf. ReadingSession.reading_intent) ; None
        ailleurs."""
        return None

    async def tell_intent(self, text: str) -> None:
        """Lecture, mode texte : ce que la réponse est, pour StudentAnswer, qui affiche le texte à lire pour une
        lecture, la réponse telle quelle sinon (conversation)."""
        if (reading := self.reading_intent(text)) is not None:
            await self.to_browser({"type": "intent", "reading": reading})

    def spelling_context(self) -> str:
        """Ce que le prof vient de dire : le contexte qui aide à orthographier la réponse transcrite (cf.
        transcribe.respelled)."""
        return " … ".join(self.recent_said[-2:] + ([self.turn.text] if self.turn.open else [])).strip()

    def spelling_label(self) -> str:
        """Ce qu'est ce contexte, pour le modèle qui relit (cf. transcribe.spelling_request)."""
        return TEACHER_CONTEXT

    async def on_student_audio(self, audio: str) -> None:
        """La transcription s'affiche telle quelle (vide : rien entendu), puis part au prof (cf. transcribe.py) ; rien
        entendu, le prof demande à l'élève de recommencer."""
        wav = base64.b64decode(audio)
        started = time.monotonic()
        # Double route voyelle : la transcription phonétique part en même temps que la transcription hébraïque.
        phonetic = (asyncio.create_task(heard_phonetic(wav, self.phonetic_model)) if self.phonetic_wanted()
                    else None)
        try:
            text = await transcribe(wav)
            if text:
                text = await respelled(await in_hebrew_letters(text), self.spelling_context(), self.spelling_label())
        except Exception:
            log.exception("Transcription impossible")
            text = ""
        self.audio_phonetic = await phonetic if phonetic else ""
        log.info("transcription en %.1f s : %s%s", time.monotonic() - started, text,
                 f" · {self.audio_phonetic}" if phonetic else "")
        # Double route voyelle : la prononciation entendue s'affiche sous la transcription si l'élève coche « Phonétique ».
        # Avant la transcription : StudentAnswer sait, à son arrivée, quoi afficher.
        if text:
            await self.tell_intent(text)
        await self.to_browser({"type": "transcript", "text": text, "phonetic": self.audio_phonetic})
        if text:
            await self.on_student_text(text, spoken=True)
        elif self.started_at is not None:
            await self.live.app_message("L'application n'a rien entendu dans la réponse enregistrée de l'élève : "
                                        "demande-lui en quelques mots de recommencer.")

    def track_voice(self, pcm: bytes) -> None:
        """Diagnostic : garde les dernières secondes du micro et journalise chaque segment de voix de l'élève."""
        self.mic += pcm
        del self.mic[: max(0, len(self.mic) - DEBUG_AUDIO_SECONDS * BYTES_PER_SECOND)]
        now = time.monotonic() - self.started_at
        if rms(pcm) > STUDENT_RMS:
            self.voice = (self.voice[0] if self.voice else now, now)
        elif self.voice and now - self.voice[1] > STUDENT_GAP_SECONDS:
            start, end = self.voice
            log.info("voix élève : %.1f s → %.1f s (%.1f s)", start, end, end - start)
            self.voice = None

    def save_student_audio(self, label: str) -> None:
        """Diagnostic : enregistre les dernières secondes du micro, pour réécouter ce que le prof a évalué."""
        DEBUG_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
        path = DEBUG_AUDIO_DIR / f"{datetime.now():%Y%m%d-%H%M%S}-{label}.wav"
        with wave.open(str(path), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(SAMPLE_RATE)
            wav.writeframes(bytes(self.mic))
        log.info("micro enregistré (%.1f s) : %s", len(self.mic) / BYTES_PER_SECOND, path.name)

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
            if self.journal:
                self.journal.write("student", text=event.data)
            await self.on_user_text(event.data)
        elif event.kind == "turn_complete":
            log.info("fin du tour du prof")
            self.end_turn()
            if self.exchange_open:
                # Le prof a répondu sans évaluer : l'élève lui parlait (question, remarque…).
                self.exchange_open = False
                await self.to_browser({"type": "exchange", "kind": "conversation"})
        elif event.kind == "tool_call":
            log.info("fonction %s %s", event.data["name"], event.data["args"])
            if self.journal:
                self.journal.write("tool_call", name=event.data["name"], args=event.data["args"])
            if self.exchange_open and event.data["name"].startswith("evaluer"):
                self.exchange_open, self.exchange_evaluated = False, True
                await self.to_browser({"type": "exchange", "kind": "evaluation"})
            if DEBUG_STUDENT_AUDIO and event.data["name"].startswith("evaluer") and self.started_at is not None:
                self.save_student_audio(event.data["name"])
            await self.on_tool_call(event.data)
        elif event.kind == "interrupted":
            # Gemini a détecté de la parole côté élève pendant que le prof parlait.
            log.info("prof interrompu")
            if self.journal:
                self.journal.write("interrupted")
            self.end_turn()
            self.playback_until = self.teacher_until = now
            await self.to_browser({"type": "interrupt"})
        elif event.kind == "started":
            self.started_at = now
            if self.journal:
                self.journal.live()
            # Ouvre la connexion de traduction avant la première prise de parole du prof.
            self.background.append(asyncio.create_task(translate_to_french("שָׁלוֹם")))
            await self.to_browser({"type": "status", "state": "live"})
            await self.on_started()
        elif event.kind == "error":
            log.warning("Erreur du modèle live : %s", event.data)
            if self.journal:
                self.journal.write("error", text=event.data)
            await self.to_browser({"type": "error", "text": event.data})

    async def on_teacher_audio(self, pcm: bytes, now: float) -> None:
        self.playback_until = max(self.playback_until, now) + len(pcm) / BYTES_PER_SECOND
        if rms(pcm) > TEACHER_RMS:
            self.teacher_until = self.playback_until
        await self.to_browser(pcm)

    def on_agent_text(self, text: str, now: float) -> None:
        if not self.turn.open:
            self.turn = TeacherTurn(id=self.turn.id + 1, shown=not self.hidden_turn,
                                    hidden=self.hidden_text if self.hidden_turn else "")
            self.hidden_turn, self.hidden_text = False, ""
            if not self.turn.shown:
                self.background.append(asyncio.create_task(self.on_hidden_turn_started()))
        turn = self.turn
        turn.text += text
        self.turn_text_at = now
        # Une ou plusieurs phrases viennent de se terminer : on les traduit sans attendre la pause.
        ends = [m.end() for m in SENTENCE_END.finditer(turn.text, turn.cut)]
        if ends:
            self.queue_segment(ends[-1])

    async def cut_teacher(self) -> bool:
        """Coupe le prof s'il parle encore (l'audio en attente de lecture est jeté) ; vrai s'il parlait."""
        if self.playback_until <= time.monotonic():
            return False
        self.end_turn()
        self.playback_until = self.teacher_until = time.monotonic()
        await self.to_browser({"type": "interrupt"})
        return True

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
            if self.journal:
                self.journal.write("teacher", text=hebrew.strip(), shown=turn.shown)
        if not turn.shown:
            # Masquée parce qu'elle pose la question : ce qu'elle dit d'autre (« Bravo ! » quand la question suivante
            # accompagne le résultat…) s'affiche quand même ; sinon, rien à traduire ni à afficher.
            hebrew = "".join(part for part in SENTENCE.findall(hebrew)
                             if turn.hidden and not repeats(part, turn.hidden))
            if not hebrew.strip():
                return
            has_words = any(c.isalnum() for c in hebrew)
        segment = {"he": hebrew, "fr": None if has_words else ""}  # une simple pause (« ... ») n'a rien à traduire
        turn.segments.append(segment)
        if has_words:
            self.background.append(asyncio.create_task(self.translate_segment(turn, segment)))

    def end_turn(self) -> None:
        if self.turn.open and self.turn.cut < len(self.turn.text):
            self.queue_segment()
        if self.turn.open and self.turn.text.strip():
            self.recent_said = [*self.recent_said[-1:], self.turn.text.strip()]
        self.turn.open = False

    async def translate_segment(self, turn: TeacherTurn, segment: dict) -> None:
        if known := self.known_translations.get(segment["he"].strip()):
            if known["spoken"] == "fr":
                segment["spoken_french"], segment["he_translation"] = True, known["hebrew"]
            segment["fr"] = known["french"]
            await self.publish_turn(turn)
            return
        # Le prof parle parfois français (évaluation orale) : la phrase s'affiche telle quelle, ses mots hébreux
        # réécrits en hébreu, et traduite en hébreu.
        if len(LATIN_LETTER.findall(segment["he"])) >= len(HEBREW_LETTER.findall(segment["he"])):
            segment["spoken_french"] = True
            try:
                french, segment["he_translation"] = await french_speech(segment["he"].strip())
            except Exception:
                log.exception("Traduction en hébreu impossible")
                french, segment["he_translation"] = segment["he"].strip(), ""
            segment["fr"] = french
            await self.publish_turn(turn)
            return
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
        spoken_french = sum(1 for seg in segments if seg.get("spoken_french")) * 2 > len(segments)
        self.teacher_seq += 1
        await self.to_browser({
            "type": "teacher", "id": turn.id, "seq": self.teacher_seq,
            # hebrew et french : la prise de parole dans les deux langues ; spoken : celle que le prof a parlée
            # (« fr » pendant l'évaluation orale), affichée d'abord, l'autre étant la traduction à déplier.
            "hebrew": " ".join(text for seg in segments
                               if (text := (seg.get("he_translation", "") if seg.get("spoken_french")
                                            else seg["he"]).strip())),
            "french": " ".join(seg["fr"].strip() for seg in segments if seg["fr"].strip()),
            "spoken": "fr" if spoken_french else "he",
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
            if self.done_at and not self.session_over.is_set():
                self.check_finished(now)

    def check_finished(self, now: float) -> None:
        """Ferme la séance quand le prof a fini son au revoir : prise de parole close, audio produit et joué."""
        quiet = (self.turn.id > self.done_turn and not self.turn.open and not self.live.to_say
                 and self.playback_until <= now)
        if not quiet:
            self.quiet_since = 0.0
        elif not self.quiet_since:
            self.quiet_since = now
        if ((self.quiet_since and now - self.quiet_since >= FINISH_GRACE_SECONDS)
                or now - self.done_at >= FINISH_TIMEOUT):
            log.info("fin de la séance : fermeture automatique")
            self.session_over.set()
