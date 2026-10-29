"""Tâche « Lecture » (cf. demande explicite du user) : l'élève lit à voix haute, l'un après l'autre, des répliques
consécutives d'un texte de sa leçon, une à la fois.

Dès que l'élève est prêt, tout le texte s'affiche à droite, puis l'application en surligne un extrait. Le prof est
aveugle : il ne connaît pas le texte et n'entend la lecture que pour la transcrire ; pendant la lecture, sa voix est
coupée. Deux verbatims : la transcription automatique de Gemini Live, en hébreu (comme dans les autres tâches), et la
transcription phonétique en lettres latines que le prof écrit lui-même (lecture_entendue, cf. phonetics.py), qui
montre les voyelles. Après READING_SILENCE_SECONDS de silence, un modèle rapide (READING_MODEL) les compare au texte
et à sa prononciation attendue, et relève les mots remplacés, ajoutés, sautés ou déformés ; ratée, l'évaluation s'affiche (réussie, rien ne s'affiche : la phrase ne
s'écrit que dans la conversation, quand le prof la relit), puis le prof la reçoit avec les phrases et la dit à
l'oral. Réussie, le prof relit lui-même l'extrait, puis l'application surligne le suivant ; ratée, l'élève relit,
autant de fois qu'il veut, ou passe à la suite avec « Lecture suivante » (cf. demande explicite du user).

L'élève choisit combien de phrases consécutives chaque lecture fait lire (1 à MAX_PHRASES_PER_READING, fenêtre
des paramètres) ; il peut aussi demander au prof de lui lire l'extrait (le haut-parleur, au bout de l'extrait).

Messages propres à la tâche (backend → navigateur, en plus de ceux de session.py) :
  {"type": "text", "lesson", "title", "phrases": [str]}
  {"type": "extract", "extract": {"number": int, "phrases": [int]} | null}
  {"type": "evaluation", "evaluation": {"answer", "errors"} | null}
  {"type": "reading_control", "control": {"number", "heard", "heard_phonetic", "expected_phonetic"}}
        (chaque lecture : les deux verbatims et la prononciation attendue, affichés si l'élève coche « Phonétique »)
  {"type": "closing"}, {"type": "question", "question": null}   (fermeture des fenêtres, cf. question.py)
  {"type": "language", "language"}, {"type": "first_turn_done"}, {"type": "phase", "phase": "done"}
Navigateur → backend : {"type": "next"}, {"type": "listen"} (le prof lit l'extrait), {"type": "per_reading", "count"},
  {"type": "language", "language": "he" | "fr"}.
"""

import asyncio
import json
import logging
import re
import time

from fastapi import WebSocket

from app.revision_agent import prompts
from app.revision_agent.comprehension import LANGUAGE_TOOL, LANGUAGES
from app.revision_agent.config import DEFAULT_LANGUAGE, READING_MODEL, READING_SILENCE_SECONDS
from app.revision_agent.evaluation import HEBREW_LETTER, align_error_words, letters
from app.revision_agent.expression import CLOSING_SECONDS, TEACHER_IDLE_TIMEOUT
from app.revision_agent.gemini_live import GeminiLive
from app.revision_agent.passages import EXTRACTS_PER_SESSION, MAX_PHRASES_PER_READING, sample_reading
from app.revision_agent.phonetics import PHONETIC_CONVENTION, reference
from app.revision_agent.session import TeacherSession, rms
from app.revision_agent.translate import translate

log = logging.getLogger("revision_agent.reading")

VOICE_RMS = 700  # niveau micro (PCM16) au-delà duquel on considère que l'élève parle
TRANSCRIPT_GRACE_SECONDS = 1.5  # fin de lecture : délai laissé à la transcription pour arriver en entier
TRANSCRIPT_SETTLED_SECONDS = 0.8  # la transcription est complète quand plus rien n'arrive depuis ce délai
PHONETIC_GRACE_SECONDS = 2.5  # fin de lecture : délai laissé au prof pour transmettre sa transcription phonétique
TEXT_FALLBACK_SECONDS = 60  # si le prof n'a toujours pas affiché le texte
TEXT_SHOWN_SECONDS = 1.2  # le texte se déroule à droite avant que le premier extrait se surligne
TEACHER_START_TIMEOUT = 4  # délai laissé au prof pour commencer à réagir au résultat
# Retour à la ligne entre deux phrases de la lecture affichée, comme dans le texte (cf. Assessment, Answer).
READING_BREAK = " \n "
# Nom du personnage en tête d'une réplique (« דוד: שלום… ») : ni lu par l'élève, ni comparé (cf. ComprehensionBoard).
SPEAKER = re.compile(r"^[^:.?!,]{1,20}:\s*")

TEXT_TOOL = {
    "name": "afficher_texte",
    "description": "Affiche le texte à l'écran de l'élève et y surligne le premier extrait à lire (le texte ne t'est "
                   "pas transmis).",
    # Bloquante : le prof attend que le texte soit là pour dire à l'élève de lire.
}

HEARD_TOOL = {
    "name": "lecture_entendue",
    "description": "Transmet à l'application ce que tu as entendu l'élève lire, son par son, en lettres latines.",
    "parameters": {
        "type": "OBJECT",
        "properties": {"phonetique": {"type": "STRING", "description": "Ce que l'élève a prononcé, transcrit son par "
                                                                     "son selon la convention, sans rien corriger"}},
        "required": ["phonetique"],
    },
    # Non bloquante : sa réponse est marquée SILENT, le prof n'en parle pas.
    "behavior": "NON_BLOCKING",
}

COMPARE_PROMPT = """Un élève francophone débutant lit à voix haute un court extrait d'un texte hébreu. On te donne :
- phrases_attendues : les phrases du texte ;
- prononciation_attendue : leur prononciation, en lettres latines (convention ci-dessous) ;
- transcription_hebreu : ce qu'il a lu, d'après une reconnaissance vocale en hébreu (écriture sans voyelles, qui
  ramène volontiers un son déformé vers un vrai mot) ;
- transcription_phonetique : ce qu'il a lu, transcrit son par son en lettres latines par quelqu'un qui ne connaît
  pas le texte (peut manquer).
Aligne mot à mot, et relève ses erreurs de lecture :
- remplace : il a lu un autre mot que le mot attendu ;
- ajoute : il a lu un mot qui n'est pas dans le texte ;
- saute : il n'a pas lu un mot du texte ;
- deforme : il a lu le mot attendu, mais mal prononcé (une voyelle, une consonne : ce que trahit la graphie de la
  transcription).
Les mots se jugent sur la transcription hébraïque ; les sons, sur la transcription phonétique, comparée à la
prononciation attendue. Deux graphies qui se prononcent pareil (ת/ט, כ/ח, ק/כ, ס/ש sans point, א/ע, lettre
finale), ou deux façons d'écrire le même son en lettres latines (kh/ch, e/é, un tiret, une apostrophe), ne sont pas
une erreur : seule une différence de son compte. Une faute de prononciation (deforme) exige la preuve de la
transcription phonétique. Si les deux transcriptions se contredisent sur un mot (l'hébreu montre un autre mot, la
phonétique le bon son), fie-toi à la phonétique : pas d'erreur. Sans transcription phonétique, juge sur l'hébreu
seul. Ne relève pas la
ponctuation, ni le nom du personnage en tête d'une réplique (« דוד: »), qu'il le lise ou non, ni une hésitation, ni un
mot répété ou repris s'il finit par le lire juste.
D'abord, lecture : ce qu'il a lu, mot pour mot dans l'ordre, en écriture hébraïque sans nikkoud, sans le nom des
personnages, une ligne par phrase attendue, dans l'ordre (comme le texte, pour qu'il suive) : un mot ajouté entre deux
phrases va sur la ligne de la phrase qui précède ; une phrase qu'il n'a pas lue du tout donne une ligne vide.
Reconstitue-la des deux transcriptions : la phonétique est souvent plus complète (la transcription
hébraïque peut perdre des mots) ; chaque mot bien lu s'écrit comme dans le texte, chaque mot mal lu au plus près de ce
qu'il a prononcé (« lamed » → למד), un mot sauté n'y figure pas. Elle s'affiche à l'élève, ses erreurs surlignées.
Pour chaque erreur : mot_entendu, le mot recopié exactement tel qu'il figure dans lecture (vide pour un mot sauté) ;
mot_attendu, le mot du texte (vide pour un mot ajouté) ; son_entendu, le mot tel qu'il figure dans la transcription
phonétique (vide s'il n'y figure pas) ; un commentaire en français, très court, factuel, à l'élève, qu'on tutoie, qui
dit ce qu'il a prononcé et comment le mot se lit (« tu as dit « lomed », ici on lit לָמֵד, « lamed » ») : le mot du
texte en écriture hébraïque avec ses nikkoud, les sons entre guillemets en lettres latines. Aucune erreur : liste
vide.

""" + PHONETIC_CONVENTION

COMPARE_SCHEMA = {
    "type": "OBJECT",
    "properties": {"lecture": {"type": "ARRAY", "items": {"type": "STRING"}}, "erreurs": {"type": "ARRAY", "items": {
        "type": "OBJECT",
        "properties": {
            "type": {"type": "STRING", "enum": ["remplace", "ajoute", "saute", "deforme"]},
            "mot_entendu": {"type": "STRING"},
            "mot_attendu": {"type": "STRING"},
            "son_entendu": {"type": "STRING"},
            "commentaire": {"type": "STRING"},
        },
        "required": ["type", "mot_entendu", "mot_attendu", "son_entendu", "commentaire"],
    }}},
    "required": ["lecture", "erreurs"],
}


def spoken(phrase: str) -> str:
    """La réplique sans le nom du personnage qui la dit."""
    return SPEAKER.sub("", phrase).strip()


def words(text: str) -> list[str]:
    return [w for w in (letters(token) for token in text.split()) if w]


async def compare_reading(expected: list[str], expected_phonetic: str, heard: str,
                          phonetic: str) -> tuple[str, list[dict]]:
    """Ce que l'élève a lu, reconstitué des deux transcriptions, une ligne par phrase (séparées par READING_BREAK),
    et ses erreurs de lecture ({word, kind, comment, expected, sound, type}, [] si la lecture est juste) ; chaque mot
    fautif figure dans la lecture, pour y être surligné."""
    request = json.dumps({"phrases_attendues": expected, "prononciation_attendue": expected_phonetic,
                          "transcription_hebreu": heard, "transcription_phonetique": phonetic}, ensure_ascii=False)
    result = json.loads(await translate(request, COMPARE_PROMPT, COMPARE_SCHEMA, READING_MODEL))
    log.info("comparaison : %s", result)
    errors = []
    for e in result.get("erreurs") or []:
        if not isinstance(e, dict) or not str(e.get("commentaire") or "").strip():
            continue
        errors.append({"word": str(e.get("mot_entendu") or "").strip(), "kind": "reading",
                       "comment": str(e["commentaire"]).strip(), "expected": str(e.get("mot_attendu") or "").strip(),
                       "sound": str(e.get("son_entendu") or "").strip(), "type": e.get("type")})
    lines = result.get("lecture") or []
    lines = [str(line).strip() for line in (lines if isinstance(lines, list) else [lines])]
    reading = READING_BREAK.join(line for line in lines if HEBREW_LETTER.search(line))
    if not HEBREW_LETTER.search(reading):
        reading = heard
    present = words(reading)
    for error in errors:
        parts = words(error["word"])
        found = lambda ws: bool(ws) and any(present[i:i + len(ws)] == ws for i in range(len(present)))  # noqa: E731
        if parts and not found(parts) and found(words(error["expected"])):
            error["word"] = error["expected"]  # mot bien écrit dans la lecture : c'est lui qu'on surligne
        elif parts and not found(parts):
            log.warning("mot fautif absent de la lecture : %s (%s)", error["word"], reading)
    return reading, errors


class ReadingSession(TeacherSession):
    def __init__(self, browser: WebSocket, voice: str, lessons: list[str], per_reading: int = 1):
        self.lesson, self.title, self.phrases, self.start = sample_reading(lessons)  # start : prochaine réplique à lire
        self.readings = min(EXTRACTS_PER_SESSION, len(self.phrases) - self.start)  # lectures prévues, au plus
        # Phrases par lecture, réglées dans les paramètres (cf. demande explicite du user).
        self.per_reading = min(max(per_reading, 1), MAX_PHRASES_PER_READING)
        self.extract: list[int] | None = None
        tools = [TEXT_TOOL, HEARD_TOOL, LANGUAGE_TOOL]
        super().__init__(browser, GeminiLive(voice, prompts.reading_instructions(self.readings),
                                             f"{prompts.READING_START} {prompts.language_mode(DEFAULT_LANGUAGE)}",
                                             tools))
        self.language = DEFAULT_LANGUAGE
        self.shown = False  # le texte est affiché
        self.asked = 0  # extraits déjà surlignés
        # Une lecture est attendue : le prof, une fois sa consigne dite, est coupé ; la voix de l'élève est guettée.
        self.reading = False
        self.requested_at = 0.0  # moment où la lecture a été demandée
        self.teacher_muted = False
        self.voice_started = False  # l'élève a commencé à lire
        self.last_voice = 0.0
        self.heard = ""  # transcription de la lecture en cours
        self.heard_at = 0.0  # arrivée de son dernier morceau
        # Transcription phonétique du prof, morceau par morceau (il peut l'envoyer à chaque pause de l'élève), recueillie
        # tant que la comparaison n'est pas partie.
        self.phonetic: list[str] = []
        self.collecting = False
        self.evaluating = False
        self.displayed = False  # la fenêtre « Lecture » montre une lecture ratée
        self.closing = False
        self.pending: list[dict] | None = None
        self.finished = False
        self.first_turn_done = False
        self.turn_started_at = 0.0
        self.advance_task: asyncio.Task | None = None

    @property
    def current(self) -> list[int] | None:
        return self.extract

    def expected(self) -> list[str]:
        return [spoken(self.phrases[i]) for i in self.current or []]

    def expected_phonetic(self) -> str:
        return " ".join((reference(self.lesson, i) or {}).get("phonetic", "") for i in self.current or []).strip()

    async def on_started(self) -> None:
        log.info("Séance de lecture lancée · voix %s · leçon %s · à partir de la réplique %d", self.live.voice,
                 self.lesson, self.start)
        await self.to_browser({"type": "language", "language": self.language})

    # --- micro de l'élève ---------------------------------------------------

    async def on_microphone(self, pcm: bytes) -> None:
        # Le prof entend toujours l'élève : c'est sa transcription qui sert de verbatim.
        if self.reading and not self.evaluating:
            now = time.monotonic()
            if now > self.teacher_until and rms(pcm) > VOICE_RMS:
                if not self.voice_started:
                    log.info("l'élève commence à lire")
                    self.voice_started = True
                    self.collecting = True
                    self.mute_teacher("l'élève lit")
                self.last_voice = now
        await super().on_microphone(pcm)

    async def on_user_text(self, text: str) -> None:
        # Recueillie jusqu’au départ de la comparaison : elle arrive souvent après le silence qui clôt la lecture.
        if self.collecting:
            self.heard += text
            self.heard_at = time.monotonic()

    # --- le prof ------------------------------------------------------------

    async def on_event(self, event) -> None:
        if event.kind == "agent_text" and not self.turn.open:
            self.turn_started_at = time.monotonic()
        await super().on_event(event)

    async def on_teacher_audio(self, pcm: bytes, now: float) -> None:
        if self.teacher_muted:
            return
        await super().on_teacher_audio(pcm, now)

    def on_agent_text(self, text: str, now: float) -> None:
        if self.teacher_muted:
            log.info("prof coupé : %s", text)
            return
        super().on_agent_text(text, now)

    def end_turn(self) -> None:
        super().end_turn()
        # Sa consigne de lecture est dite : il se tait jusqu'au résultat.
        if self.reading and not self.evaluating and self.turn_started_at >= self.requested_at:
            self.mute_teacher("consigne terminée")

    def mute_teacher(self, reason: str) -> None:
        if not self.teacher_muted:
            log.info("prof coupé jusqu'à la fin de la lecture (%s)", reason)
            self.teacher_muted = True

    def unmute_teacher(self) -> None:
        if self.teacher_muted:
            log.info("prof rétabli")
            self.teacher_muted = False

    async def on_tool_call(self, call: dict) -> None:
        name, args = call["name"], call.get("args") or {}
        if name == TEXT_TOOL["name"]:
            if self.shown:
                await self.live.tool_response(call["id"], name, {"consigne": self.in_mode(prompts.TEXT_ALREADY_SHOWN)})
                return
            await self.show_text()
            await self.live.tool_response(call["id"], name, {"consigne": self.in_mode(prompts.READING_TEXT_SHOWN)})
        elif name == HEARD_TOOL["name"]:
            text = str(args.get("phonetique") or "").strip()
            if self.collecting and text:
                self.phonetic.append(text)
            else:
                log.info("transcription phonétique hors lecture, ignorée")
            await self.live.tool_response(call["id"], name, {"resultat": prompts.HEARD_NOTED}, silent=True)
        elif name == LANGUAGE_TOOL["name"]:
            await self.set_language(LANGUAGES.get(args.get("langue"), self.language))
            await self.live.tool_response(call["id"], name, {"consigne": prompts.language_mode(self.language)})
        else:
            await super().on_tool_call(call)

    # --- texte et extraits ----------------------------------------------------

    async def show_text(self) -> None:
        """Tout le texte s'affiche, puis le premier extrait s'y surligne."""
        self.shown = True
        await self.to_browser({"type": "text", "lesson": self.lesson, "title": self.title, "phrases": self.phrases})
        await self.next_extract(delay=TEXT_SHOWN_SECONDS)

    async def next_extract(self, delay: float = 0) -> bool:
        """Surligne l'extrait suivant et attend sa lecture ; faux s'il n'y en a plus (la séance se termine)."""
        if self.asked >= EXTRACTS_PER_SESSION or self.start >= len(self.phrases):
            await self.finish()
            return False
        if self.displayed:
            await self.close_windows()
        self.asked += 1
        self.extract = list(range(self.start, min(self.start + self.per_reading, len(self.phrases))))
        self.start = self.extract[-1] + 1
        log.info("extrait %d/%d : %s", self.asked, self.readings, self.expected())
        message = {"type": "extract", "extract": {"number": self.asked, "phrases": self.current}}
        if self.closing:
            self.pending = [message]
        elif delay:
            async def later() -> None:
                await asyncio.sleep(delay)
                await self.to_browser(message)
            self.background.append(asyncio.create_task(later()))
        else:
            await self.to_browser(message)
        self.await_reading()
        return True

    def await_reading(self) -> None:
        self.reading = True
        self.requested_at = time.monotonic()
        self.voice_started = False
        self.heard = ""
        self.phonetic = []
        self.collecting = False

    async def close_windows(self) -> None:
        """La fenêtre de la lecture se ferme de bas en haut, puis l'extrait suivant se surligne (cf. question.py)."""
        await self.to_browser({"type": "closing"})
        self.closing, self.pending, self.displayed = True, None, False

        async def clear() -> None:
            await asyncio.sleep(CLOSING_SECONDS)
            await self.to_browser({"type": "evaluation", "evaluation": None})
            await self.to_browser({"type": "question", "question": None})
            self.closing = False
            if self.pending:
                messages, self.pending = self.pending, None
                for message in messages:
                    await self.to_browser(message)

        self.background.append(asyncio.create_task(clear()))

    async def finish(self) -> None:
        if not self.finished:
            self.finished = True
            self.reading = False
            self.unmute_teacher()
            await self.to_browser({"type": "extract", "extract": None})
            await self.to_browser({"type": "phase", "phase": "done"})

    # --- fin de lecture et évaluation ---------------------------------------

    async def tick(self, now: float) -> None:
        if (not self.first_turn_done and self.turn.segments and not self.turn.open
                and 0 < self.playback_until <= now):
            self.first_turn_done = True
            await self.to_browser({"type": "first_turn_done"})
        if not self.shown and now - self.started_at > TEXT_FALLBACK_SECONDS:
            log.info("pas de demande de texte : affichage d'office")
            await self.show_text()
            await self.live.app_message(self.in_mode(prompts.READING_TEXT_SHOWN))
        elif (self.reading and self.voice_started and not self.evaluating
              and now - self.last_voice >= READING_SILENCE_SECONDS):
            self.evaluating = True
            self.background.append(asyncio.create_task(self.evaluate()))

    async def evaluate(self) -> None:
        """La transcription de la lecture est comparée aux phrases attendues ; l'évaluation s'affiche, puis le prof
        la reçoit et y réagit à l'oral."""
        started = time.monotonic()
        while ((not HEBREW_LETTER.search(self.heard) or time.monotonic() - self.heard_at < TRANSCRIPT_SETTLED_SECONDS)
               and time.monotonic() < started + TRANSCRIPT_GRACE_SECONDS):
            await asyncio.sleep(0.1)
        while not self.phonetic and time.monotonic() < started + PHONETIC_GRACE_SECONDS:
            await asyncio.sleep(0.1)
        self.collecting = False
        heard = self.heard.strip()
        phonetic = " ".join(self.phonetic)
        expected = self.expected()
        log.info("fin de lecture (%.1f s d'attente) : %s · %s", time.monotonic() - started, heard,
                 phonetic or "pas de transcription phonétique")
        self.reading = False
        self.unmute_teacher()
        if not HEBREW_LETTER.search(heard) and not phonetic:
            self.evaluating = False
            log.info("lecture inaudible")
            self.await_reading()
            await self.live.app_message(self.in_mode(prompts.READING_NOT_HEARD))
            return
        started = time.monotonic()
        try:
            # Les répliques entières : le modèle ignore le nom du personnage, que l'élève le lise ou non.
            reading, errors = await compare_reading([self.phrases[i] for i in self.current], self.expected_phonetic(),
                                                    heard, phonetic)
        except Exception:
            log.exception("Comparaison de la lecture impossible")
            reading, errors = heard, None
        log.info("comparaison en %.1f s", time.monotonic() - started)
        self.evaluating = False
        await self.to_browser({"type": "reading_control", "control": {
            "number": self.asked, "heard": heard, "reading": reading, "heard_phonetic": phonetic,
            "expected_phonetic": self.expected_phonetic()}})
        if errors is None:
            await self.to_browser({"type": "error", "text": "L’évaluation de la lecture a échoué."})
            self.await_reading()
            await self.live.app_message(self.in_mode(prompts.READING_EVALUATION_FAILED))
            return
        if errors:
            # Ratée : la lecture et ses erreurs s'affichent ; l'élève relit, une fois que le prof lui a montré son
            # erreur.
            self.displayed = True
            await self.to_browser({"type": "evaluation", "evaluation": {
                "answer": align_error_words(reading, errors),
                "errors": [{k: e[k] for k in ("word", "kind", "comment")} for e in errors]}})
            self.await_reading()
            await self.live.app_message(self.in_mode(prompts.reading_retry(expected, reading, errors)))
            return
        # Réussie : rien ne s'affiche, la phrase ne s'écrit que dans la conversation, quand le prof la relit (cf.
        # demande explicite du user) ; une lecture ratée encore affichée s'en va.
        if self.displayed:
            await self.close_windows()
        await self.live.app_message(self.in_mode(prompts.reading_done(expected)))
        self.start_advance()

    # --- enchaînement ---------------------------------------------------------

    def start_advance(self) -> None:
        self.cancel_advance()
        self.advance_task = asyncio.create_task(self.advance())
        self.background.append(self.advance_task)

    async def advance(self) -> None:
        """Dès que le prof a fini de relire l'extrait, surligne le suivant (ou clôt la séance)."""
        speaking = lambda: self.turn.open or self.playback_until > time.monotonic()  # noqa: E731
        deadline = time.monotonic() + TEACHER_START_TIMEOUT
        while not speaking() and time.monotonic() < deadline:
            await asyncio.sleep(0.1)
        deadline = time.monotonic() + TEACHER_IDLE_TIMEOUT * 2  # il relit tout un extrait
        while speaking() and time.monotonic() < deadline:
            await asyncio.sleep(0.1)
        await self.go_on()

    async def go_on(self) -> None:
        if self.finished:
            return
        if await self.next_extract():
            await self.live.app_message(self.in_mode(prompts.READING_NEXT_EXTRACT))
        else:
            await self.live.app_message(self.in_mode(prompts.READING_END))

    def cancel_advance(self) -> None:
        if self.advance_task and not self.advance_task.done() and self.advance_task is not asyncio.current_task():
            self.advance_task.cancel()
        self.advance_task = None

    # --- navigateur -------------------------------------------------------------

    async def on_browser_message(self, data: dict) -> None:
        if data.get("type") == "language" and data.get("language") in prompts.LANGUAGE_NAMES:
            if data["language"] != self.language:
                await self.set_language(data["language"])
                speaking = not self.teacher_muted and await self.cut_teacher()
                await (self.live.app_message if speaking else self.live.note)(prompts.language_switched(self.language))
            return
        if data.get("type") == "per_reading":
            await self.set_per_reading(data.get("count"))
            return
        if data.get("type") == "listen":
            await self.listen()
            return
        # « Lecture suivante » : l'extrait suivant se surligne aussitôt, sans que le prof relise celui-ci (cf.
        # demande explicite du user).
        if data.get("type") != "next" or not self.current or self.closing or self.finished or self.evaluating:
            return
        self.reading = False
        self.unmute_teacher()
        await self.cut_teacher()
        self.cancel_advance()
        await self.go_on()

    async def set_per_reading(self, count) -> None:
        """Nouveau nombre de phrases par lecture : il vaut pour l'extrait en cours tant que l'élève n'a pas commencé à
        le lire, sinon pour le suivant."""
        if not isinstance(count, int) or not 1 <= count <= MAX_PHRASES_PER_READING or count == self.per_reading:
            return
        log.info("phrases par lecture : %d", count)
        self.per_reading = count
        current = self.current
        if (current and self.reading and not self.voice_started and not self.evaluating and not self.displayed
                and not self.closing and not self.finished):
            self.extract = list(range(current[0], min(current[0] + count, len(self.phrases))))
            self.start = self.extract[-1] + 1
            log.info("extrait %d redécoupé : %s", self.asked, self.expected())
            await self.to_browser({"type": "extract", "extract": {"number": self.asked, "phrases": self.extract}})

    async def listen(self) -> None:
        """Le haut-parleur : le prof lit l'extrait à l'élève, qui le lit ensuite à son tour."""
        if (not self.current or self.closing or self.finished or self.evaluating
                or (self.advance_task and not self.advance_task.done())):
            return
        log.info("l'élève demande au prof de lire l'extrait")
        self.unmute_teacher()
        await self.cut_teacher()
        self.await_reading()  # une fois l'extrait lu, le prof se tait et la lecture de l'élève est guettée
        await self.live.app_message(self.in_mode(prompts.reading_listen(self.expected())))

    async def set_language(self, language: str) -> None:
        log.info("mode de langue : %s", language)
        self.language = language
        await self.to_browser({"type": "language", "language": language})

    def in_mode(self, message: str) -> str:
        return f"{message} {prompts.language_mode(self.language)}"
