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
from difflib import SequenceMatcher

from fastapi import WebSocket

from app.revision_agent import prompts
from app.revision_agent.comprehension import LANGUAGE_TOOL, LANGUAGES
from app.revision_agent.config import DEFAULT_LANGUAGES, READING_MODEL, READING_SILENCE_SECONDS
from app.revision_agent.evaluation import HEBREW_LETTER, letters
from app.revision_agent.expression import CLOSING_SECONDS, TEACHER_IDLE_TIMEOUT
from app.revision_agent.gemini_live import GeminiLive
from app.revision_agent.passages import EXTRACTS_PER_SESSION, MAX_PHRASES_PER_READING, sample_reading
from app.revision_agent.phonetics import PHONETIC_CONVENTION, reference
from app.revision_agent.session import TeacherSession, rms
from app.revision_agent.text_teacher import TextTeacher
from app.revision_agent.judges import mispronounced
from app.revision_agent.schema import (app_message, as_json, pronunciation_judge, step, teacher, teacher_voice,
                                       transcription, welcome)
from app.revision_agent.transcribe import TEXT_CONTEXT
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
seul.
Le ו de la conjonction « et », collé au mot, se prononce « ve », « u » ou « vi » selon une règle que l'élève n'a pas
à appliquer : si le seul écart sur un mot est la prononciation de ce ו (« ve-david » pour « u-david », « ve-yerakot »
pour « vi-rakot », ou l'inverse),
ce n'est pas une erreur de lecture ; relève-le quand même, avec le type vav, et un commentaire qui dit ce qu'il a
prononcé, comment le texte le lit, et que ce n'est pas une faute importante (jamais « pas une faute » tout court).
Si le mot a une autre erreur, c'est une erreur ordinaire. Ne relève pas la
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
# Double route voyelle (cf. demande explicite du user) : la prononciation est jugée à part, en même temps (cf.
# judges.mispronounced) ; la comparaison ne juge plus que les mots.
WORDS_ONLY = """
La prononciation est jugée à part : ne relève ni deforme ni vav. Un mot du texte qu'il a lu, même mal prononcé,
s'écrit dans lecture comme dans le texte."""

COMPARE_SCHEMA = {
    "type": "OBJECT",
    "properties": {"lecture": {"type": "ARRAY", "items": {"type": "STRING"}}, "erreurs": {"type": "ARRAY", "items": {
        "type": "OBJECT",
        "properties": {
            "type": {"type": "STRING", "enum": ["remplace", "ajoute", "saute", "deforme", "vav"]},
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


# Mode texte, pendant qu'une lecture est attendue : l'envoi de l'élève est une lecture, sauf s'il compte assez de mots
# absents du texte à lire (cf. demande explicite du user : un programme simple, un seuil haut, dans le doute une
# lecture) ; c'est alors une phrase adressée au prof (une question…), une conversation.
QUESTION_MIN_WORDS = 3  # au moins tant de mots absents du texte
QUESTION_SHARE = 0.6  # et cette part, au moins, des mots dits
NEAR_WORD = 0.7  # un mot mal lu reste un mot du texte, à cette ressemblance près (cf. SequenceMatcher)
PREFIXES = "והבלמשכ"


def word_forms(word: str) -> set[str]:
    """Le mot, et sans sa lettre préfixe (ו, ה, ב…), mal lue ou oubliée."""
    return {word, word[1:]} if len(word) > 2 and word[0] in PREFIXES else {word}


def foreign_words(text: str, expected: list[str]) -> list[str]:
    """Les mots dits absents du texte à lire, à une lecture approximative près ; un mot en lettres latines (l'élève
    parle français) l'est toujours."""
    target = [form for word in words(" ".join(expected)) for form in word_forms(word)]
    foreign = []
    for token in text.split():
        word = letters(token)
        if word:
            if not any(SequenceMatcher(None, form, other).ratio() >= NEAR_WORD
                       for form in word_forms(word) for other in target):
                foreign.append(word)
        elif re.search(r"[A-Za-zÀ-ÿ]", token):
            foreign.append(token)
    return foreign


def to_teacher(text: str, expected: list[str]) -> bool:
    """L'envoi de l'élève est adressé au prof, pas une lecture (cf. QUESTION_MIN_WORDS)."""
    foreign = foreign_words(text, expected)
    said = sum(1 for token in text.split() if letters(token) or re.search(r"[A-Za-zÀ-ÿ]", token))
    return len(foreign) >= QUESTION_MIN_WORDS and len(foreign) >= QUESTION_SHARE * said


def compare_request(expected: list[str], expected_phonetic: str, heard: str, phonetic: str,
                    sounds: bool = True) -> tuple[str, str]:
    """L'instruction et le message du juge des mots (cf. compare_reading, et schema)."""
    return (COMPARE_PROMPT + ("" if sounds else WORDS_ONLY),
            json.dumps({"phrases_attendues": expected, "prononciation_attendue": expected_phonetic,
                        "transcription_hebreu": heard, "transcription_phonetique": phonetic}, ensure_ascii=False))


async def compare_reading(expected: list[str], expected_phonetic: str, heard: str, phonetic: str,
                          sounds: bool = True) -> tuple[str, list[dict]]:
    """Ce que l'élève a lu, reconstitué des deux transcriptions, une ligne par phrase (séparées par READING_BREAK),
    et ses erreurs de lecture ({word, kind, comment, expected, sound, type}, [] si la lecture est juste) ; chaque mot
    fautif figure dans la lecture, pour y être surligné. Le ו « ve » / « u » (type vav) n'est qu'une remarque (kind
    note) : ni affichée ni dite au prof, pas une faute importante, elle ne fait pas rater la lecture (cf. demande explicite
    du user). sounds faux : les mots seulement, la prononciation étant jugée à part (WORDS_ONLY)."""
    prompt, request = compare_request(expected, expected_phonetic, heard, phonetic, sounds)
    result = json.loads(await translate(request, prompt, COMPARE_SCHEMA, READING_MODEL))
    log.info("comparaison : %s", result)
    errors = []
    for e in result.get("erreurs") or []:
        if not isinstance(e, dict) or not str(e.get("commentaire") or "").strip():
            continue
        # Il en relève parfois malgré WORDS_ONLY (vérifié) : la prononciation n'a qu'un juge.
        if not sounds and e.get("type") in ("deforme", "vav"):
            continue
        errors.append({"word": str(e.get("mot_entendu") or "").strip(),
                       "kind": "note" if e.get("type") == "vav" else "reading",
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


def schema() -> dict:
    """Le schéma de la tâche (cf. schema.py), sur un exemple : une phrase lue « shlosha » et « ivrat », et
    transcrite « אברית », relu « עברית »."""
    text = "יש לי שלוש בנות ושני בנים וגם הם לומדים עברית."
    expected_phonetic = "yesh li shalosh banot u-shnei vanim ve-gam hem lomdim ivrit"
    raw = "יש לי שלושה בנות ושני בנים וגם הם לומדים אברית."
    heard = "יש לי שלושה בנות ושני בנים וגם הם לומדים עברית."
    phonetic = "yesh li shlosha banot ve-shnei banim ve-gam hem lomdim ivrat"
    reading = "יש לי שלוש בנות ושני בנים וגם הם לומדים עברית"
    shlosha = "Tu as dit « shlosha », on dit שָׁלוֹשׁ, « shalosh »."
    ivrat = "Tu as dit « ivrat », on dit עִבְרִית, « ivrit »."
    vav = "Tu as dit « ve-shnei », le texte dit וּשְׁנֵי, « u-shnei » : la forme courante de l'hébreu parlé."
    banim = "Tu as dit « banim », le texte dit בָנִים, « vanim » : la forme courante de l'hébreu parlé."
    words = [{"mot": mot, "correct": correct, "entendu": entendu, "faute": faute, "remarque": remarque,
              **({"commentaire": comment} if comment else {})}
             for mot, correct, entendu, faute, remarque, comment in [
                 ("יש", "yesh", "yesh", False, False, ""), ("לי", "li", "li", False, False, ""),
                 ("שלוש", "shalosh", "shlosha", True, False, shlosha), ("בנות", "banot", "banot", False, False, ""),
                 ("ושני", "u-shnei", "ve-shnei", False, True, vav), ("בנים", "vanim", "banim", False, True, banim),
                 ("וגם", "ve-gam", "ve-gam", False, False, ""), ("הם", "hem", "hem", False, False, ""),
                 ("לומדים", "lomdim", "lomdim", False, False, ""), ("עברית", "ivrit", "ivrat", True, False, ivrat)]]
    errors = [{"word": word, "kind": "pronunciation", "comment": comment, "expected": word, "sound": sound,
               "type": "deforme"} for word, sound, comment in [("שלוש", "shlosha", shlosha), ("עברית", "ivrat", ivrat)]]
    words_system, words_message = compare_request([text], expected_phonetic, heard, phonetic, sounds=False)
    retry_reply = "אָמַרְתָּ \"shlosha\", אוֹמְרִים שָׁלוֹשׁ. קְרָא שׁוּב אֶת הַמִּשְׁפָּטִים."

    def in_mode(message: str) -> str:
        return f"{message} {prompts.language_mode(DEFAULT_LANGUAGES['lecture'])}"

    return {
        "title": "Lecture",
        "intro": "De la voix de l'élève au verdict, en mode texte, avec les modèles par défaut. Deux juges travaillent "
                 "en parallèle ; le verdict est tranché par le code de l'application, le prof ne fait que le dire.",
        "flow": [
            *([[[recorded]]] if (recorded := welcome("lecture", DEFAULT_LANGUAGES["lecture"])) else []),
            [[step("student", "1 · L'élève", title="Lit à voix haute les phrases surlignées",
                   hint=f"{READING_SILENCE_SECONDS} secondes de silence marquent la fin de sa lecture.")]],
            transcription(raw, heard, phonetic, text, TEXT_CONTEXT),
            [[step("model", "3a · Juge des mots", model=READING_MODEL, model_note="fixe",
                   source="reading.compare_reading",
                   text="A-t-il lu les bons mots ? Compare le texte attendu aux deux transcriptions.",
                   items=("mot sauté", "mot ajouté", "mot remplacé par un autre"),
                   hint="Ne juge pas les sons (consigne WORDS_ONLY).", system=words_system, message=words_message,
                   output=as_json({"lecture": [reading], "erreurs": []}))],
             [pronunciation_judge("3b · Juge de prononciation", text, phonetic, words, expected_phonetic,
                                  "Les mots lus sont-ils bien prononcés ? Compare, mot par mot, la phonétique "
                                  "entendue à la prononciation de référence (préparée à l'avance, cf. "
                                  "phonetics.py).")]],
            [[step("code", "4 · Agrégateur", source="reading.py · evaluate()",
                   title="Réunit les fautes des deux juges et tranche",
                   items=("un mot relevé par les deux juges : le juge de prononciation l'emporte sur « remplacé » (il "
                          "dit ce qui a été prononcé, « u », pas ce que la transcription en a fait, « hi ») ; un mot "
                          "sauté reste sauté",
                          "les remarques vertes sont écartées : ni affichées, ni dites au prof, sans effet sur le "
                          "verdict",
                          "au moins une faute → ratée ; aucune → réussie"))]],
            [[step("bad", "5a · Lecture ratée", source="prompts.reading_retry",
                   text="Écran : le texte à lire, mots mal lus ou sautés surlignés et commentés, sa phonétique "
                        "dessous. Prof : explique l'erreur, puis "
                        "demande de relire.", hint="Retour à l'étape 1.",
                   message=app_message(in_mode(prompts.reading_retry([text], reading, errors))),
                   output=retry_reply)],
             [step("good", "5b · Lecture réussie", source="prompts.reading_done",
                   text="Écran : la phrase soulignée en vert, puis cochée. Prof : un mot pour féliciter, puis relit "
                        "lui-même la phrase.", hint="Phrases suivantes.",
                   message=app_message(in_mode(prompts.reading_done([text]))),
                   output="מְצֻיָּן! יֵשׁ לִי שָׁלוֹשׁ בָּנוֹת וּשְׁנֵי בָנִים וְגַם הֵם לוֹמְדִים עִבְרִית.")]],
        ],
        "notes": [
            teacher(prompts.reading_instructions(EXTRACTS_PER_SESSION),
                    f"{prompts.READING_START} {prompts.language_mode(DEFAULT_LANGUAGES['lecture'])}",
                    "Ne juge rien : il reçoit le verdict déjà tranché (5a ou 5b) et le met en mots. Il ne peut pas le "
                    "changer.", "lecture", DEFAULT_LANGUAGES["lecture"]),
            *teacher_voice(retry_reply, "Tu as dit « shlosha », on dit שָׁלוֹשׁ. Relis les phrases.",
                           "Tu as dit shlosha, on dit shalosh.",
                           {"francais": "Tu as dit שלושה, on dit שלוש.", "hebreu": "אמרת שלושה, אומרים שלוש."}),
            "Exception : sans transcription phonétique (par exemple si l'élève a corrigé sa transcription à la main), "
            "le juge de prononciation ne tourne pas ; le juge des mots juge alors tout, sons compris.",
            f"Les messages affichés sont ceux d'un exemple : la phrase « {text} », lue « shlosha » et « ivrat ». Les "
            "instructions système sont celles du code actuel.",
        ],
    }


class ReadingSession(TeacherSession):
    def __init__(self, browser: WebSocket, voice: str, lessons: list[str], per_reading: int = 1):
        self.lesson, self.title, self.phrases, self.start = sample_reading(lessons)  # start : prochaine réplique à lire
        self.readings = min(EXTRACTS_PER_SESSION, len(self.phrases) - self.start)  # lectures prévues, au plus
        # Phrases par lecture, réglées dans les paramètres (cf. demande explicite du user).
        self.per_reading = min(max(per_reading, 1), MAX_PHRASES_PER_READING)
        self.extract: list[int] | None = None
        tools = [TEXT_TOOL, HEARD_TOOL, LANGUAGE_TOOL]
        super().__init__(browser, GeminiLive(voice, prompts.reading_instructions(self.readings),
                                             f"{prompts.READING_START} {prompts.language_mode(DEFAULT_LANGUAGES["lecture"])}",
                                             tools))
        self.language = DEFAULT_LANGUAGES["lecture"]
        self.shown = False  # le texte est affiché
        self.asked = 0  # extraits déjà surlignés
        # Une lecture est attendue : le prof, une fois sa consigne dite, est coupé ; la voix de l'élève est guettée.
        self.reading = False
        self.requested_at = 0.0  # moment où la lecture a été demandée
        self.teacher_muted = False
        self.reading_triage = True  # le tri lecture / question au prof (cf. to_teacher, reading_intent)
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

    def spelling_context(self) -> str:
        # Pendant la lecture, l'élève lit l'extrait : c'est lui qui aide à orthographier ce qu'il a lu.
        return " ".join(self.expected()) if self.reading else super().spelling_context()

    def spelling_label(self) -> str:
        return TEXT_CONTEXT if self.reading else super().spelling_label()

    async def on_student_text(self, text: str, spoken: bool = False, corrected: bool = False) -> None:
        # Sans Gemini Live (cf. text_teacher.py), la lecture enregistrée arrive d'un bloc, transcrite : elle est
        # comparée tout de suite, sans passer par le prof, qui reçoit ensuite l'évaluation (cf. evaluate), comme en Live.
        if not isinstance(self.live, TextTeacher) or not self.reading or self.evaluating:
            await super().on_student_text(text, spoken, corrected)
            return
        if not text or self.started_at is None:
            return
        # Une réponse écrite ou corrigée : StudentAnswer apprend ici ce qu'elle est (cf. on_student_audio).
        if not spoken or corrected:
            await self.tell_intent(text)
        # Une réponse enregistrée, transcrite en direct : ce qu'elle est a été décidé sur cette transcription-là, et
        # déjà affiché (cf. TeacherSession.heard_live).
        reading = self.audio_intent if self.audio_intent is not None and spoken and not corrected else None
        self.audio_intent = None
        if not (self.reading_intent(text) if reading is None else reading):
            # Une phrase adressée au prof (cf. to_teacher) : il y répond, en conversation, et la lecture reste
            # attendue ; sa prononciation n'est pas jugée.
            log.info("pas une lecture, pour le prof (mots hors du texte : %s) : %s",
                     foreign_words(text, self.expected()), text)
            self.audio_phonetic = ""
            await super().on_student_text(text, spoken, corrected)
            return
        log.info("lecture enregistrée : %s", text)
        if self.journal:
            self.journal.write("student", text=text)
        self.heard, self.heard_at = text, 0.0
        # Double route voyelle : la transcription phonétique de l'audio, pas celle d'une réponse corrigée à la main.
        self.phonetic = [self.audio_phonetic] if self.audio_phonetic and not corrected else []
        # Sa prononciation, jugée à part, en même temps que la comparaison (cf. demande explicite du user).
        self.pronunciation = (asyncio.create_task(mispronounced(" ".join(self.expected()), self.phonetic[0],
                                                                self.pronunciation_model, self.expected_phonetic()))
                              if self.phonetic and self.pronunciation_model else None)
        self.voice_started = self.collecting = self.evaluating = True
        self.background.append(asyncio.create_task(self.evaluate()))

    def phonetic_wanted(self) -> bool:
        return self.phonetic_model is not None and self.reading and not self.evaluating

    def reading_intent(self, text: str) -> bool | None:
        if not isinstance(self.live, TextTeacher) or not self.reading or self.evaluating:
            return None
        return not self.reading_triage or not to_teacher(text, self.expected())

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
        # Sans Gemini Live, le prof ne parle que quand l'application le lui demande : rien à couper. Sa voix arrive
        # après son texte, une fois son tour fini : coupée, elle se perdait (cf. demande explicite du user).
        if isinstance(self.live, TextTeacher):
            return
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
        # Sans Gemini Live, le prof n'entend pas la lecture : la transcription phonétique, s'il y en a une (double route
        # voyelle), est arrivée avec la transcription hébraïque ; rien à attendre.
        while (not self.phonetic and not isinstance(self.live, TextTeacher)
               and time.monotonic() < started + PHONETIC_GRACE_SECONDS):
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
        checking, self.pronunciation = self.pronunciation, None
        try:
            # Les répliques entières : le modèle ignore le nom du personnage, que l'élève le lise ou non.
            reading, errors = await compare_reading([self.phrases[i] for i in self.current], self.expected_phonetic(),
                                                    heard, phonetic, sounds=checking is None)
            if checking:
                errors = self.with_pronunciation(await checking, errors)
        except Exception:
            log.exception("Comparaison de la lecture impossible")
            reading, errors = heard, None
        log.info("comparaison en %.1f s", time.monotonic() - started)
        self.evaluating = False
        if errors is None:
            await self.to_browser({"type": "error", "text": "L’évaluation de la lecture a échoué."})
            self.await_reading()
            await self.live.app_message(self.in_mode(prompts.READING_EVALUATION_FAILED))
            return
        # S'affiche le texte à lire, ses mots mal lus ou sautés surlignés, pas la transcription : Gemini Transcribe
        # ramène un son déformé vers un vrai mot (« u » écrit « היא »), qu'on surlignerait à tort (cf. demande explicite
        # du user). En mode texte, StudentAnswer affiche ce même texte dès l'envoi de la lecture (cf. extractText).
        evaluation = {"answer": READING_BREAK.join(expected),
                      "errors": [{"word": e["expected"] or e["word"], "kind": e["kind"], "comment": e["comment"]}
                                 for e in errors]}
        if isinstance(self.live, TextTeacher):
            # Sans Gemini Live, comme en expression libre (cf. demande explicite du user) : l'évaluation s'affiche dans
            # la fenêtre de la réponse, fautes surlignées ou, réussie, soulignée en vert puis cochée (cf. StudentAnswer).
            await self.to_browser({"type": "exchange", "kind": "evaluation", "evaluation": evaluation})
        # Les remarques (la forme courante de l'hébreu parlé, cf. judges.VERDICT) ne font pas rater la lecture, et ne
        # sont pas dites au prof (cf. demande explicite du user).
        faults = [e for e in errors if e["kind"] != "note"]
        if faults:
            # Ratée : la lecture et ses erreurs s'affichent ; l'élève relit, une fois que le prof lui a montré son
            # erreur.
            self.displayed = True
            await self.to_browser({"type": "evaluation", "evaluation": evaluation})
            self.await_reading()
            await self.live.app_message(self.in_mode(prompts.reading_retry(expected, reading, faults)))
            return
        # Réussie : rien ne s'affiche, la phrase ne s'écrit que dans la conversation, quand le prof la relit (cf.
        # demande explicite du user) ; une lecture ratée encore affichée s'en va. Une remarque ne s'affiche pas (cf.
        # useRevisionSession.withoutNotes).
        if self.displayed:
            await self.close_windows()
        await self.live.app_message(self.in_mode(prompts.reading_done(expected)))
        self.start_advance()

    @staticmethod
    def with_pronunciation(faults: list[dict], errors: list[dict]) -> list[dict]:
        """Les erreurs de la comparaison, et les mots mal prononcés (cf. judges.mispronounced) : faute de
        prononciation, ou remarque pour la forme courante de l'hébreu parlé. Sur un mot relevé par les deux, le juge de
        prononciation l'emporte sur un mot « remplacé » : il dit ce qui a été prononcé (« u »), la comparaison ce que
        la transcription en a fait (« היא », cf. demande explicite du user) ; un mot sauté reste sauté."""
        judged = {letters(f["mot"]) for f in faults}
        errors = [e for e in errors if not (e["type"] == "remplace" and letters(e["expected"]) in judged)]
        taken = {letters(e["expected"]) for e in errors} | {letters(e["word"]) for e in errors}
        return errors + [{"word": f["mot"], "kind": "note" if f["remarque"] else "pronunciation",
                          "comment": f["commentaire"], "expected": f["mot"], "sound": f["entendu"],
                          "type": "vav" if f["remarque"] else "deforme"}
                         for f in faults if letters(f["mot"]) not in taken]

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
