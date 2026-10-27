"""Le prof : Gemini Live, via le WebSocket BidiGenerateContent (les fonctions qu'il peut appeler dépendent de la tâche)."""

import base64
import json
import re
from dataclasses import dataclass
from typing import Any, AsyncIterator, Literal

import websockets

from app.config import GEMINI_API_KEY
from app.revision_agent.config import GEMINI_SILENCE_MS, LIVE_MODEL, SAMPLE_RATE

URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
NON_SPEECH = re.compile(r"<[^<>]*>|\{[^{}]*\}")
HEBREW = re.compile(r"[֐-׿]")  # lettres et nikkoud
HEBREW_LETTER = re.compile(r"[א-ת]")

EventKind = Literal[
    "started",          # la session est prête
    "audio",            # data = PCM16 24 kHz de la voix du prof
    "agent_text",       # data = fragment de transcription du prof
    "user_text",        # data = fragment de transcription de l'élève
    "tool_call",        # data = {"id", "name", "args"} : appel d'une des fonctions de la tâche
    "turn_complete",    # le prof a fini sa prise de parole
    "interrupted",      # le prof a été coupé : l'audio en attente de lecture doit être jeté
    "error",            # data = message
]


@dataclass
class LiveEvent:
    kind: EventKind
    data: Any = None


class GeminiLive:
    def __init__(self, voice: str, instructions: str, start_message: str, tools: list[dict]):
        self.voice = voice
        self.instructions = instructions
        self.start_message = start_message
        self.tools = tools  # déclarations de fonctions (format functionDeclarations)
        self.ws = None
        self._pending = ""  # début de marqueur de non-parole en attente de sa fin
        self._last_char = ""  # dernier caractère transmis de la transcription du prof

    async def connect(self) -> None:
        self.ws = await websockets.connect(f"{URL}?key={GEMINI_API_KEY}", max_size=None)
        await self._send({"setup": {
            "model": f"models/{LIVE_MODEL}",
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": self.voice}}},
            },
            "systemInstruction": {"parts": [{"text": self.instructions}]},
            "tools": [{"functionDeclarations": self.tools}],
            # Fin de tour tardive et peu sensible : l'élève hésite en lisant, le prof ne doit pas le couper.
            "realtimeInputConfig": {"automaticActivityDetection": {
                "endOfSpeechSensitivity": "END_SENSITIVITY_LOW",
                "silenceDurationMs": GEMINI_SILENCE_MS,
                "prefixPaddingMs": 200,
            }},
            # L'élève lit en hébreu : transcription littérale, sans nettoyage.
            "inputAudioTranscription": {"languageCodes": ["he-IL"], "mode": "VERBATIM"},
            "outputAudioTranscription": {},
        }})

    async def _send(self, message: dict) -> None:
        await self.ws.send(json.dumps(message, ensure_ascii=False))

    async def _say(self, text: str, respond: bool = True) -> None:
        """Message de l'application, inséré comme un tour utilisateur ; respond=False l'ajoute au contexte sans réponse."""
        await self._send({"clientContent": {"turns": [{"role": "user", "parts": [{"text": text}]}], "turnComplete": respond}})

    async def events(self) -> AsyncIterator[LiveEvent]:
        async for raw in self.ws:
            message = json.loads(raw)
            if "setupComplete" in message:
                await self._say(self.start_message)
                yield LiveEvent("started")

            content = message.get("serverContent")
            if content:
                for part in content.get("modelTurn", {}).get("parts", []):
                    if "inlineData" in part:
                        yield LiveEvent("audio", base64.b64decode(part["inlineData"]["data"]))
                if text := self._clean_transcript(content.get("outputTranscription", {}).get("text", "")):
                    yield LiveEvent("agent_text", text)
                if text := content.get("inputTranscription", {}).get("text"):
                    yield LiveEvent("user_text", text)
                if content.get("interrupted"):
                    yield LiveEvent("interrupted")
                if content.get("turnComplete"):
                    yield LiveEvent("turn_complete")

            for call in message.get("toolCall", {}).get("functionCalls", []):
                yield LiveEvent("tool_call", {"id": call["id"], "name": call["name"], "args": call.get("args") or {}})

            if "error" in message:
                yield LiveEvent("error", message["error"].get("message", "Erreur de l’agent"))

    def _clean_transcript(self, fragment: str) -> str:
        """Retire les marqueurs de non-parole (« <no speech> », « {pause} »), qui peuvent arriver en plusieurs fragments."""
        text = NON_SPEECH.sub("", self._pending + fragment)
        # Un marqueur ouvert mais pas encore fermé est gardé pour le fragment suivant.
        cut = min((i for i in (text.rfind("<"), text.rfind("{")) if i >= 0 and not any(c in text[i:] for c in ">}")), default=len(text))
        if len(text) - cut > 40:  # un « < » isolé, pas un marqueur : on ne retient pas le texte
            cut = len(text)
        self._pending = text[cut:]
        text = text[:cut]
        # Gemini oublie parfois l'espace entre deux fragments (« הַמּוֹרֶהשֶׁלְּךָ ») ; il coupe toujours entre deux mots.
        if text and HEBREW.match(self._last_char) and HEBREW_LETTER.match(text[0]):
            text = " " + text
        self._last_char = text[-1:] or self._last_char
        return text

    async def send_audio(self, pcm: bytes) -> None:
        await self._send({"realtimeInput": {"audio": {
            "data": base64.b64encode(pcm).decode(),
            "mimeType": f"audio/pcm;rate={SAMPLE_RATE}",
        }}})

    async def app_message(self, text: str) -> None:
        await self._say(f"(Message de l'application, pas de l'élève) {text}")

    async def note(self, text: str) -> None:
        """Indication ajoutée au contexte du prof, sans qu'il prenne la parole."""
        await self._say(f"(Message de l'application, pas de l'élève) {text}", respond=False)

    async def tool_response(self, call_id: str, name: str, response: dict, silent: bool = False,
                            when_idle: bool = False) -> None:
        """Réponse à une fonction non bloquante — silent : intégrée par le prof sans qu'il prenne la parole ;
        when_idle : il y réagit dès qu'il a fini de parler.
        scheduling se place au niveau de la FunctionResponse : glissé dans son contenu, il n'est pas appliqué (le prof
        reprend alors la parole, et peut même prononcer « silent »)."""
        function_response = {"id": call_id, "name": name, "response": response}
        if silent:
            function_response["scheduling"] = "SILENT"
        elif when_idle:
            function_response["scheduling"] = "WHEN_IDLE"
        await self._send({"toolResponse": {"functionResponses": [function_response]}})

    async def close(self) -> None:
        await self.ws.close()
