"""Le prof en mode texte, sans Gemini Live (cf. demande explicite du user) : un modèle texte (cf. config.TEXT_TEACHER_MODELS)
appelé à chaque prise de parole avec tout l'historique de la séance. L'élève écrit ses réponses, le prof les siennes ;
aucune voix dans un sens ni dans l'autre.

Même interface que GeminiLive (les tâches n'utilisent que self.live) et mêmes événements, sans audio ni interruption :
- message de l'application, texte de l'élève, réponse de fonction ordinaire ou « when_idle » : le prof reprend la
  parole ; note et réponse « silent » : ajoutées à son contexte, sans qu'il parle ;
- tant qu'un de ses appels de fonction attend sa réponse, il ne parle pas : la réponse arrive avec ce qui s'est dit
  entre-temps, dans un seul tour ;
- avec un modèle TTS (cf. tts.py), chaque prise de parole est aussi dite à voix haute : son audio suit le texte, en
  événements « audio », prise de parole après prise de parole, sans retarder la suite de la séance.
"""

import asyncio
import logging
import re
from collections import Counter
from typing import AsyncIterator

from google import genai
from google.genai import types

from app.config import GEMINI_API_KEY
from app.revision_agent.config import TEXT_TEACHER_MODELS
from app.revision_agent.gemini_live import LiveEvent
from app.revision_agent.tts import speak

log = logging.getLogger("revision_agent.text_teacher")

APP_PREFIX = "(Message de l'application, pas de l'élève) "
EMPTY_RETRIES = 2  # nouvelles demandes au prof après une prise de parole vide
INTRO_CHUNK_BYTES = 9600  # accueil enregistré : envoyé au navigateur par morceaux de 0,2 s (PCM16 24 kHz)
# Flash-Lite écrit parfois une ligne parasite, un seul mot latin collé, en minuscules et sans ponctuation, avant sa
# réplique (« opaquetext », vérifié) : jamais une vraie réplique, elle est retirée avant d'être affichée et dite.
STRAY_LINE = re.compile(r"^[ \t]*[a-z_]+[ \t]*(\r?\n|$)", re.MULTILINE)
# Flash-Lite glisse parfois un mot arabe dans une réplique hébraïque (« هُمَا » pour הֵם, vérifié) : filet de sécurité
# (cf. demande explicite du user), les caractères arabes sont retirés avant d'être affichés et dits, et le cas noté.
ARABIC = re.compile(r"[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]+")
SPACES = re.compile(r"[ \t]{2,}")


class TextTeacher:
    def __init__(self, model: str, instructions: str, start_message: str, tools: list[dict],
                 tts_model: str | None = None, voice: str | None = None):
        self.model = model
        self.tts_model = tts_model
        self.voice = voice
        # Sans voix, rien à attendre de la lecture audio côté navigateur.
        self.speaks = tts_model is not None
        self.speech: asyncio.Queue[str] = asyncio.Queue()  # prises de parole à dire, dans l'ordre
        self.speaker: asyncio.Task | None = None
        self.to_say = 0  # prises de parole dont l'audio n'a pas fini d'arriver
        self.instructions = instructions
        self.start_message = start_message
        # « behavior » (NON_BLOCKING) n'existe qu'en Live : ici, le prof attend toujours la réponse.
        self.tools = [{k: v for k, v in tool.items() if k != "behavior"} for tool in tools]
        self.journal = None  # journal de la séance (cf. app.revision_agent.journal), branché par le routeur
        self.client: genai.Client | None = None
        self.config: types.GenerateContentConfig | None = None
        self.history: list[types.Content] = []
        self.responses: list[types.Part] = []  # réponses de fonction du prochain tour
        self.parts: list[types.Part] = []  # messages du prochain tour
        self.awaiting: set[str] = set()  # appels de fonction du prof encore sans réponse
        self.wanted = False  # le prof doit reprendre la parole
        self.wake = asyncio.Event()
        self.queue: asyncio.Queue[LiveEvent] = asyncio.Queue()
        self.worker: asyncio.Task | None = None
        self.calls = 0
        self.usage = Counter()  # tokens de la séance : « input » (cache compris), « cached », « output »
        # L'accueil enregistré de la tâche (cf. intros.py), joué au lancement à la place de la première prise de parole.
        self.intro: dict | None = None
        # L'au revoir fixe, par mode de langue (cf. intros.farewells), et celui à dire : la tâche est finie (cf. end).
        self.farewells: dict | None = None
        self.farewell: dict | None = None
        self.ended = False
        # Répliques écrites par l'application, à dire à la place d'une prise de parole générée (cf. say), avec ce qui
        # attend qu'elles soient dites.
        self.scripted: list[tuple[dict, asyncio.Future]] = []

    @classmethod
    def replacing(cls, live, model: str, tts_model: str | None = None, phonetic: bool = True) -> "TextTeacher":
        """Le prof texte à la place du prof Live d'une tâche : mêmes instructions, plus celles de l'échange écrit (sans
        la prononciation entendue si phonetic est faux, cf. prompts.text_mode), et même voix, avec un modèle TTS."""
        from app.revision_agent import prompts
        return cls(model, live.instructions + prompts.text_mode(phonetic), live.start_message, live.tools, tts_model,
                   live.voice)

    async def connect(self) -> None:
        self.client = genai.Client(api_key=GEMINI_API_KEY)
        self.config = types.GenerateContentConfig(
            system_instruction=self.instructions,
            tools=[types.Tool(function_declarations=self.tools)],
            thinking_config=types.ThinkingConfig(thinking_level="low"),
        )

    async def events(self) -> AsyncIterator[LiveEvent]:
        yield LiveEvent("started")
        self.worker = asyncio.create_task(self._work())
        if self.speaks:
            self.speaker = asyncio.create_task(self._speak())
        if self.intro:
            await self._play_intro()
        else:
            self._add(types.Part(text=self.start_message), respond=True)
        while True:
            yield await self.queue.get()

    def _add(self, part: types.Part, respond: bool) -> None:
        self.parts.append(part)
        self.wanted = self.wanted or respond
        self.wake.set()

    async def _work(self) -> None:
        while True:
            await self.wake.wait()
            self.wake.clear()
            while self.wanted and not self.awaiting and not self.ended:
                self.wanted = False
                if self.scripted:
                    # Une réplique de l'application (cf. say) : jouée comme une réplique enregistrée.
                    entry, done = self.scripted.pop(0)
                    parts, self.responses, self.parts = self.responses + self.parts, [], []
                    # Jamais un tour vide dans l'historique : la réplique répond toujours à quelque chose.
                    parts = parts or [types.Part(text=APP_PREFIX + "Réplique de l'application.")]
                    await self._play_recorded(entry, parts, "réplique de l'application")
                    done.set_result(None)
                    self.wanted = self.wanted or bool(self.scripted)
                elif self.farewell:
                    # La dernière prise de parole : l'au revoir fixe, pas une réplique générée.
                    self.ended = True
                    parts, self.responses, self.parts = self.responses + self.parts, [], []
                    await self._play_recorded(self.farewell, parts, "au revoir")
                else:
                    await self._generate()

    async def say(self, entry: dict) -> None:
        """Une réplique écrite par l'application ({"text", "pcm"} : son texte, sa voix enregistrée ou None pour la dire
        à la volée), dite à la place d'une prise de parole générée et gardée dans l'historique du prof comme la sienne
        (cf. demande explicite du user : la déclinaison, sans le prof pour féliciter ni commenter) ; rend la main
        quand elle est partie."""
        done = asyncio.get_running_loop().create_future()
        self.scripted.append((entry, done))
        self.wanted = True
        self.wake.set()
        await done

    def end(self, language: str) -> None:
        """La tâche est finie (cf. TeacherSession.to_browser, phase « done ») : la prochaine prise de parole du prof,
        son au revoir, est l'au revoir fixe de ce mode de langue (cf. demande explicite du user)."""
        if self.farewells and not self.farewell:
            self.farewell = self.farewells.get(language) or self.farewells["he"]

    async def _generate(self) -> None:
        parts, self.responses, self.parts = self.responses + self.parts, [], []
        # Une génération vide n'a laissé aucun tour du prof : ce tour-ci complète le précédent.
        if self.history and self.history[-1].role == "user":
            self.history[-1].parts.extend(parts)
        else:
            self.history.append(types.Content(role="user", parts=parts))
        # Le prof répond parfois par une prise de parole vide (Flash-Lite, vérifié) : l'élève resterait sans réponse,
        # on lui redemande.
        for attempt in range(EMPTY_RETRIES + 1):
            try:
                response = await self.client.aio.models.generate_content(model=self.model, contents=self.history,
                                                                         config=self.config)
            except Exception as error:
                log.exception("Génération du prof impossible")
                await self.queue.put(LiveEvent("error", f"Erreur du prof : {error}"))
                return
            self._count(response.usage_metadata)
            content = response.candidates[0].content if response.candidates else None
            if content is not None and content.parts:
                break
            log.warning("prise de parole vide du prof (essai %d, %s)", attempt + 1,
                        response.candidates[0].finish_reason if response.candidates else "sans candidat")
        else:
            await self.queue.put(LiveEvent("turn_complete"))
            return
        for part in content.parts:
            if part.text and not part.thought and STRAY_LINE.search(part.text):
                log.warning("ligne parasite retirée : %r", part.text)
                part.text = STRAY_LINE.sub("", part.text).strip()
            if part.text and not part.thought and ARABIC.search(part.text):
                log.warning("caractères arabes retirés : %r", part.text)
                part.text = SPACES.sub(" ", ARABIC.sub("", part.text)).replace(" ,", ",").strip()
        self.history.append(content)
        if self.speaks and (said := " ".join(p.text.strip() for p in content.parts if p.text and not p.thought)):
            self.to_say += 1
            self.speech.put_nowait(said)
        for part in content.parts:
            if part.text and not part.thought:
                await self.queue.put(LiveEvent("agent_text", part.text))
            if call := part.function_call:
                self.calls += 1
                call.id = call.id or f"appel_{self.calls}"
                self.awaiting.add(call.id)
                await self.queue.put(LiveEvent("tool_call", {"id": call.id, "name": call.name,
                                                             "args": dict(call.args or {})}))
        await self.queue.put(LiveEvent("turn_complete"))

    async def _play_intro(self) -> None:
        await self._play_recorded(self.intro, [types.Part(text=self.start_message)], "accueil")

    async def _play_recorded(self, entry: dict, parts: list[types.Part], label: str) -> None:
        """Une réplique enregistrée (l'accueil, l'au revoir), comme si le prof venait de l'écrire en réponse à parts :
        son texte, puis sa voix enregistrée (dite à la volée, enregistrée avec un autre modèle de voix)."""
        text = entry["text"]
        log.info("%s enregistré%s", label, "" if entry["pcm"] else ", voix dite à la volée")
        if self.history and self.history[-1].role == "user":
            self.history[-1].parts.extend(parts)
        else:
            self.history.append(types.Content(role="user", parts=parts))
        self.history.append(types.Content(role="model", parts=[types.Part(text=text)]))
        await self.queue.put(LiveEvent("agent_text", text))
        if self.speaks and entry["pcm"]:
            pcm = entry["pcm"]
            for start in range(0, len(pcm), INTRO_CHUNK_BYTES):
                await self.queue.put(LiveEvent("audio", pcm[start:start + INTRO_CHUNK_BYTES]))
        elif self.speaks:
            self.to_say += 1
            self.speech.put_nowait(text)
        await self.queue.put(LiveEvent("turn_complete"))

    async def _speak(self) -> None:
        while True:
            text = await self.speech.get()
            try:
                async for pcm in speak(text, self.tts_model, self.voice):
                    await self.queue.put(LiveEvent("audio", pcm))
            except Exception:
                log.exception("Voix du prof impossible")
            finally:
                self.to_say -= 1

    def _count(self, usage) -> None:
        if usage is None:
            return
        self.usage["input"] += usage.prompt_token_count or 0
        self.usage["cached"] += usage.cached_content_token_count or 0
        self.usage["output"] += (usage.candidates_token_count or 0) + (usage.thoughts_token_count or 0)

    def bill(self) -> dict:
        """Tokens consommés en entrée (dont ceux lus en cache) et en sortie, et leur prix (cf. TEXT_TEACHER_MODELS)."""
        prices = TEXT_TEACHER_MODELS[self.model]
        fresh = self.usage["input"] - self.usage["cached"]
        return {"item": "Le prof", "model": self.model, "input_tokens": self.usage["input"],
                "cached_tokens": self.usage["cached"],
                "input_cost": (fresh * prices["input"] + self.usage["cached"] * prices["cached"]) / 1e6,
                "output_tokens": self.usage["output"], "output_cost": self.usage["output"] * prices["output"] / 1e6}

    async def student_text(self, text: str, spoken: bool = False, corrected: bool = False, phonetic: str = "",
                           respond: bool = True) -> None:
        """La réponse de l'élève, écrite, ou spoken : la transcription de sa réponse orale ; corrected : cette
        transcription corrigée à la main par l'élève ; phonetic : sa prononciation entendue, voyelles comprises (double
        route voyelle, cf. prompts.TEXT_MODE) ; respond faux : gardée dans l'historique sans que le prof réponde
        (l'application y répond elle-même, cf. say)."""
        prefix = ("(Réponse orale, transcription corrigée par l'élève) " if corrected
                  else "(Réponse orale) " if spoken else "")
        heard = f"\n(Prononciation entendue : {phonetic})" if phonetic else ""
        self._add(types.Part(text=prefix + text + heard), respond=respond)

    async def send_audio(self, pcm: bytes) -> None:
        pass  # pas de micro en mode texte

    async def app_message(self, text: str) -> None:
        if self.journal:
            self.journal.write("app_message", text=text)
        self._add(types.Part(text=APP_PREFIX + text), respond=True)

    async def note(self, text: str) -> None:
        """Indication ajoutée au contexte du prof, sans qu'il prenne la parole."""
        if self.journal:
            self.journal.write("app_note", text=text)
        self._add(types.Part(text=APP_PREFIX + text), respond=False)

    async def tool_response(self, call_id: str, name: str, response: dict, silent: bool = False,
                            when_idle: bool = False) -> None:
        """Réponse à un appel de fonction du prof — silent : intégrée sans qu'il prenne la parole ; when_idle : comme
        une réponse ordinaire (en texte, le prof a toujours fini de parler)."""
        if self.journal:
            self.journal.write("tool_response", name=name, response=response, silent=silent, when_idle=when_idle)
        self.responses.append(types.Part(function_response=types.FunctionResponse(id=call_id, name=name,
                                                                                   response=response)))
        self.awaiting.discard(call_id)
        self.wanted = self.wanted or not silent
        self.wake.set()

    async def close(self) -> None:
        for task in (self.worker, self.speaker):
            if task:
                task.cancel()
