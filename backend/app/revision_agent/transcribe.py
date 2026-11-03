"""Mode texte : la réponse enregistrée de l'élève, transcrite par un modèle de transcription (cf. demande explicite du
user) avant d'aller au prof comme une réponse écrite."""

import logging
import re
from collections import Counter

from google import genai
from google.genai import types

from app.config import GEMINI_API_KEY
from app.revision_agent.config import SPELLING_MODEL, TRANSCRIBE_MODEL
from app.revision_agent.phonetics import PHONETIC_CONVENTION
from app.revision_agent.translate import FLASH_USAGE

log = logging.getLogger("revision_agent.transcribe")

_client: genai.Client | None = None
# L'hébreu imposé : en détection automatique, la voix d'un débutant est transcrite en français, voire dans une langue
# au hasard (vérifié) ; une phrase dite en français reste transcrite en français.
CONFIG = types.GenerateContentConfig(audio_transcription_config=types.AudioTranscriptionConfig(language_codes=["he-IL"]))

# Un mot hébreu qui se prononce comme son cousin arabe est parfois écrit en arabe (« يوم » pour « יום », vérifié), et
# le prof ne répond alors plus rien : chaque lettre arabe est remplacée par la lettre hébraïque correspondante, en
# forme finale en fin de mot.
ARABIC_TO_HEBREW = str.maketrans({
    "ا": "א", "أ": "א", "إ": "א", "آ": "א", "ء": "א", "ب": "ב", "ت": "ת", "ث": "ת", "ج": "ג", "ح": "ח", "خ": "כ",
    "د": "ד", "ذ": "ז", "ر": "ר", "ز": "ז", "س": "ס", "ش": "ש", "ص": "צ", "ض": "צ", "ط": "ט", "ظ": "ט", "ع": "ע",
    "غ": "ג", "ف": "פ", "ق": "ק", "ك": "כ", "ل": "ל", "م": "מ", "ن": "נ", "ه": "ה", "ة": "ה", "و": "ו", "ؤ": "ו",
    "ي": "י", "ى": "י", "ئ": "י",
})
ARABIC = re.compile("[\\u0600-\\u06FF]")  # alphabet arabe
FINAL_FORMS = {"כ": "ך", "מ": "ם", "נ": "ן", "פ": "ף", "צ": "ץ"}

# La transcription a souvent la bonne prononciation mais pas la bonne orthographe (« הם תסים לפריז » pour « הם טסים
# לפריז ») : elle est relue d'après le contexte, ce que le prof vient de dire (cf. demande explicite du user). Filet de
# sécurité : un mot corrigé n'est gardé que s'il se prononce comme celui de la transcription (même clé sonore, cf.
# sound_key) ; sinon, le mot transcrit reste. Les fautes de l'élève (accord, mot, forme) restent ainsi pour le prof.
SPELLING_PROMPT = """Voici la transcription automatique de la réponse orale d'un élève débutant en hébreu, et ce que
son professeur venait de lui dire (« Le professeur ») ou le texte qu'il devait lire à voix haute (« Texte à lire »).
La prononciation transcrite est juste, mais l'orthographe est parfois fausse : une lettre remplacée par une autre qui
se prononce pareil (ט/ת, כ/ח/ק, ס/שׂ, א/ע/ה, ב/ו), ou une lettre muette en trop ou en moins (א, ה, ע, ו, י).
Corrige uniquement ces fautes d'orthographe, en t'aidant du contexte pour reconnaître le mot que l'élève a prononcé
(« הם תסים לפריז » → « הם טסים לפריז »). Ne change jamais la prononciation d'un mot : ne corrige ni la grammaire, ni
l'accord, ni le choix des mots, ni leur ordre, même s'ils sont faux, car son professeur doit corriger ses fautes. Il a
pu lire autrement que le texte : ne remplace jamais un de ses mots par celui du texte s'il ne se prononce pas pareil
(« שלושה » reste « שלושה » quand le texte dit « שלוש »). Ne touche ni à la ponctuation ni aux mots en lettres latines.
Sans nikkoud.
Réponds uniquement par la transcription, corrigée ou telle quelle, sans guillemets ni commentaire."""
# Clé sonore d'un mot : les lettres qui se prononcent pareil confondues, les formes finales ramenées aux autres ; un
# א, un ה ou un ע en fin de mot font le son « a » (גר / גרה, חמש / חמישה se prononcent autrement), ailleurs ils sont
# muets et supprimés. ו et י restent : ils portent des voyelles (לומד / למד).
SAME_SOUND = str.maketrans({"ט": "ת", "ח": "כ", "ך": "כ", "ק": "כ", "ס": "ש", "ם": "מ", "ן": "נ", "ף": "פ",
                            "ץ": "צ"})
FINAL_A = re.compile("[אהע]$")
SILENT = re.compile("[אהע]")
NOT_HEBREW = re.compile("[^א-ת]")
WORD_PARTS = re.compile(r"^(\W*)(.*?)(\W*)$")  # ponctuation avant, mot, ponctuation après

# Lecture, « double route voyelle » (cf. demande explicite du user) : la transcription hébraïque n'a pas de voyelles
# (« lamad » et « lomed » s'écrivent למד) ; un modèle Flash écoute aussi l'audio et l'écrit en lettres latines, voyelles
# comprises, avec la convention de la prononciation attendue (cf. phonetics.py). Il ne reçoit pas le texte à lire : il
# entendrait ce qu'il s'attend à entendre.
PHONETIC_PROMPT = f"""Tu entends un élève débutant lire de l'hébreu à voix haute. Écris en lettres latines exactement
ce qu'il prononce, voyelles comprises, même si c'est faux : ne corrige rien, ne devine pas le mot qu'il voulait lire,
n'ajoute rien. Ce qui n'est pas audible ne s'écrit pas.
{PHONETIC_CONVENTION}
Réponds uniquement par la transcription, sans guillemets ni commentaire."""

PHONETIC_THINKING = {"gemini-3.8-flash": "low"}

# Malgré l'hébreu imposé, la transcription sort parfois en lettres latines (« Hana gera Tel Aviv. », vérifié) ; la
# relecture ne peut alors rien garder (aucune lettre hébraïque à comparer, cf. same_sound). L'élève voit sa réponse en
# hébreu, seule la phonétique est en lettres latines (cf. demande explicite du user) : elle est d'abord réécrite en
# lettres hébraïques, telle que prononcée.
SCRIPT_PROMPT = """Voici la transcription automatique de la réponse orale d'un élève débutant en hébreu. Les mots
hébreux y sont écrits en lettres latines : réécris-les tous en lettres hébraïques, noms propres compris (Tel Aviv,
Hana, David), avec l'orthographe hébraïque usuelle du mot prononcé, sans nikkoud (« Hana gera Tel Aviv. » → « חנה גרה תל אביב. »). Ne corrige rien : ni la grammaire, ni
l'accord, ni le choix des mots, ni leur ordre, n'ajoute ni ne retire aucun mot, et ne traduis jamais. Garde la
ponctuation. Les mots français restent tels quels ; une phrase en français reste entièrement identique, noms propres
compris (« Ils habitent à Tel Aviv. » reste « Ils habitent à Tel Aviv. »).
Réponds uniquement par la transcription réécrite, sans guillemets ni commentaire."""
HEBREW_LETTER = re.compile("[א-ת]")
LATIN_LETTER = re.compile("[A-Za-zÀ-ÿ]")


def hebraized(text: str) -> str:
    if not ARABIC.search(text):
        return text
    words = [word.translate(ARABIC_TO_HEBREW) if ARABIC.search(word) else word for word in text.split(" ")]
    words = [re.sub(r"[כמנפצ](?=[^א-ת]*$)", lambda m: FINAL_FORMS[m.group()], word) if word else word
             for word in words]
    result = re.sub(ARABIC, "", " ".join(words))
    log.info("lettres arabes dans la transcription : %s → %s", text, result)
    return result


def sound_key(text: str) -> str:
    return "".join(SILENT.sub("", FINAL_A.sub("a", NOT_HEBREW.sub("", word).translate(SAME_SOUND)))
                   for word in text.split())


def same_sound(heard: str, spelled: str) -> str:
    """La transcription relue, mot à mot : chaque mot corrigé qui ne se prononce pas comme le mot transcrit est remis
    tel qu'il était transcrit ; découpée autrement, la relecture n'est gardée que si le tout se prononce pareil."""
    words, respelled_words = heard.split(), spelled.split()
    if len(words) != len(respelled_words):
        return spelled if sound_key(spelled) == sound_key(heard) else heard

    def kept(old: str, new: str) -> str:
        # La ponctuation de la transcription reste.
        before, _, after = WORD_PARTS.match(old).groups()
        return before + WORD_PARTS.match(new).group(2) + after if sound_key(new) == sound_key(old) else old

    return " ".join(kept(old, new) for old, new in zip(words, respelled_words))


# Ce qu'est le contexte de la relecture (cf. TeacherSession.spelling_label) : ce que le prof vient de dire, ou, en
# lecture, le texte que l'élève lit (cf. demande explicite du user).
TEACHER_CONTEXT = "Le professeur"
TEXT_CONTEXT = "Texte à lire"


def spelling_request(text: str, context: str, label: str = TEACHER_CONTEXT) -> str:
    """Le message de la relecture de l'orthographe (cf. respelled, et le schéma de chaque tâche)."""
    return f"{label} : {context or '(rien)'}\nTranscription : {text}"


async def respelled(text: str, context: str, label: str = TEACHER_CONTEXT) -> str:
    """L'orthographe de la transcription relue d'après le contexte, sa prononciation inchangée (cf. SPELLING_PROMPT) ;
    telle quelle si la relecture échoue."""
    global _client
    _client = _client or genai.Client(api_key=GEMINI_API_KEY)
    try:
        response = await _client.aio.models.generate_content(
            model=SPELLING_MODEL, contents=spelling_request(text, context, label),
            config=types.GenerateContentConfig(
                system_instruction=SPELLING_PROMPT, temperature=0,
                thinking_config=types.ThinkingConfig(thinking_level="minimal"),
            ),
        )
    except Exception:
        log.exception("relecture de l'orthographe impossible : %s", text)
        return text
    if (usage := FLASH_USAGE.get()) is not None and (meta := response.usage_metadata):
        counts = usage.setdefault(SPELLING_MODEL, Counter())
        counts["input"] += meta.prompt_token_count or 0
        counts["output"] += (meta.candidates_token_count or 0) + (meta.thoughts_token_count or 0)
    spelled = hebraized((response.text or "").strip())
    if not spelled:
        return text
    kept = same_sound(text, spelled)
    if kept != text:
        log.info("orthographe relue : %s → %s", text, kept)
    if kept != spelled:
        log.info("relecture écartée, prononciation changée : %s", spelled)
    return kept


async def in_hebrew_letters(text: str) -> str:
    """La transcription, ses mots hébreux en lettres hébraïques (cf. SCRIPT_PROMPT) ; telle quelle si elle est déjà
    surtout en hébreu ou si l'appel échoue."""
    if len(LATIN_LETTER.findall(text)) <= len(HEBREW_LETTER.findall(text)):
        return text
    global _client
    _client = _client or genai.Client(api_key=GEMINI_API_KEY)
    try:
        response = await _client.aio.models.generate_content(
            model=SPELLING_MODEL, contents=text,
            config=types.GenerateContentConfig(
                system_instruction=SCRIPT_PROMPT, temperature=0,
                thinking_config=types.ThinkingConfig(thinking_level="minimal"),
            ),
        )
    except Exception:
        log.exception("réécriture en lettres hébraïques impossible : %s", text)
        return text
    if (usage := FLASH_USAGE.get()) is not None and (meta := response.usage_metadata):
        counts = usage.setdefault(SPELLING_MODEL, Counter())
        counts["input"] += meta.prompt_token_count or 0
        counts["output"] += (meta.candidates_token_count or 0) + (meta.thoughts_token_count or 0)
    written = hebraized((response.text or "").strip())
    if written and written != text:
        log.info("transcription en lettres latines : %s → %s", text, written)
    return written or text


async def heard_phonetic(wav: bytes, model: str) -> str:
    """Ce que l'élève a prononcé, en lettres latines (cf. PHONETIC_PROMPT) ; vide si l'appel échoue."""
    global _client
    _client = _client or genai.Client(api_key=GEMINI_API_KEY)
    try:
        response = await _client.aio.models.generate_content(
            model=model, contents=[types.Part.from_bytes(data=wav, mime_type="audio/wav")],
            config=types.GenerateContentConfig(
                system_instruction=PHONETIC_PROMPT, temperature=0,
                # gemini-3.8-flash refuse « minimal » (vérifié).
                thinking_config=types.ThinkingConfig(thinking_level=PHONETIC_THINKING.get(model, "minimal")),
            ),
        )
    except Exception:
        log.exception("transcription phonétique impossible")
        return ""
    if (usage := FLASH_USAGE.get()) is not None and (meta := response.usage_metadata):
        counts = usage.setdefault(model, Counter())
        counts["input"] += meta.prompt_token_count or 0
        counts["output"] += (meta.candidates_token_count or 0) + (meta.thoughts_token_count or 0)
    return (response.text or "").strip()


async def transcribe(wav: bytes) -> str:
    global _client
    _client = _client or genai.Client(api_key=GEMINI_API_KEY)
    response = await _client.aio.models.generate_content(
        model=TRANSCRIBE_MODEL, contents=[types.Part.from_bytes(data=wav, mime_type="audio/wav")], config=CONFIG)
    if (usage := FLASH_USAGE.get()) is not None and (meta := response.usage_metadata):
        counts = usage.setdefault(TRANSCRIBE_MODEL, Counter())
        counts["input"] += meta.prompt_token_count or 0
        counts["output"] += meta.candidates_token_count or 0
    parts = response.candidates[0].content.parts if response.candidates and response.candidates[0].content else []
    return hebraized(" ".join(part.audio_transcription.text.strip() for part in parts or []
                              if part.audio_transcription and part.audio_transcription.text).strip())
