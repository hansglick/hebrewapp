"""Le schéma d'une tâche (page /dev/revision-agent-schema, cf. demande explicite du user) : ses étapes, le modèle de
chacune et ce qu'il reçoit, lus dans le code à chaque appel ; une modification d'un prompt ou d'un modèle s'y voit
aussitôt. Chaque tâche décrit son flux dans son fichier (une fonction schema()), avec les étapes communes d'ici.

Un schéma : {"title", "intro", "flow" : [rangée, …], "notes" : [étape ou texte, …]} ; une rangée : ses colonnes, côte à
côte (ce qui tourne en parallèle) ; une colonne : ses étapes, l'une sous l'autre ; une étape : cf. step. Les entrées
sont celles d'un exemple, construites par les fonctions mêmes qui les construisent pour les modèles ; les sorties, ce
qu'un modèle répond à cet exemple (écrites à la main, au format de sa réponse : cf. demande explicite du user).
"""

import json

from app.revision_agent import prompts
from app.revision_agent.config import (FRENCH_SPEECH_MODEL, PHONETIC_MODELS, PRONUNCIATION_MODELS, SPELLING_MODEL,
                                      TEXT_TEACHER_MODEL, TRANSCRIBE_MODEL, TRANSLATION_MODEL, TTS_MODELS)
from app.revision_agent.intros import FAREWELL, FAREWELL_TEXTS, INTRO_TTS_MODEL, INTRO_VOICE, intros
from app.revision_agent.judges import pronunciation_request
from app.revision_agent.text_teacher import APP_PREFIX
from app.revision_agent.transcribe import (PHONETIC_PROMPT, SCRIPT_PROMPT, SPELLING_PROMPT, TEACHER_CONTEXT,
                                           spelling_request)
from app.revision_agent.translate import FRENCH_SPEECH_PROMPT, TRANSLATION_PROMPT
from app.revision_agent.tts import speech_input

AUDIO = "[l'enregistrement audio de l'élève, WAV]"
# Remise en lettres hébraïques : elle ne sert que si la transcription sort en lettres latines, un autre exemple.
LATIN_HEARD, LATIN_WRITTEN = "hem lomdim ivrit ba-ulpan.", "הם לומדים עברית באולפן."
LANGUAGE_NAMES = {"he": "hébreu", "fr": "français"}


def as_json(value) -> str:
    """Une sortie JSON, comme le modèle la rend (cf. translate, response_schema)."""
    return json.dumps(value, ensure_ascii=False, indent=1)


def step(kind: str, role: str, *, model: str = "", model_note: str = "", source: str = "", title: str = "",
         text: str = "", items: tuple = (), hint: str = "", when: str = "", system: str | None = None,
         message: str | None = None, output: str | None = None, parts: tuple = (), small: bool = False) -> dict:
    """Une étape — kind : « student », « model » (un modèle), « code » (du code de l'application, pas un modèle),
    « bad » / « good » (le verdict) ; system : l'instruction système du modèle ; message : son entrée, sur l'exemple ;
    output : sa sortie ; parts : d'autres textes à montrer, (titre, texte) ; source : la fonction du code ; small : une
    étape secondaire, sous la précédente."""
    shown = [("Instruction système", system), ("Entrée (exemple)", message), ("Sortie (exemple)", output), *parts]
    return {"kind": kind, "role": role, "model": model, "model_note": model_note, "source": source, "title": title,
            "text": text, "items": list(items), "hint": hint, "when": when, "small": small,
            "prompts": [{"label": label, "text": value} for label, value in shown if value is not None]}


def app_message(text: str) -> str:
    """Un message de l'application au prof, tel qu'il le reçoit en mode texte (cf. TextTeacher.app_message)."""
    return APP_PREFIX + text


def welcome(task: str, language: str) -> dict | None:
    """L'accueil enregistré de la tâche (cf. intros.py), dans le mode de langue de départ ; None s'il n'y en a pas."""
    entries = intros().get(task, {})
    if language not in entries:
        return None

    def said(entry: dict) -> str:
        return entry["text"] + (f"\n\n{entry['french']}" if entry["french"] != entry["text"] else "")

    modes = [language] + [mode for mode in entries if mode != language]
    return step("code", "0 · Accueil enregistré", source=f"intros.py · {entries[language]['audio']}",
                title="Le prof accueille l'élève", text=f"« {entries[language]['french']} »",
                hint=f"Joué tel quel au lancement, sans appeler le prof : texte fixe, voix enregistrée ({INTRO_VOICE}, "
                     f"{INTRO_TTS_MODEL}) ; avec un autre modèle de voix, le même texte dit à la volée. Mode texte "
                     "seulement.",
                parts=tuple((f"Mode {LANGUAGE_NAMES.get(mode, mode)}{' (celui du départ)' if mode == language else ''}",
                             said(entries[mode])) for mode in modes))


def farewell(role: str, language: str) -> dict:
    """L'au revoir fixe du prof, commun à toutes les tâches (cf. intros.FAREWELL_TEXTS, TextTeacher.end)."""
    recorded = intros().get(FAREWELL, {})
    modes = [language] + [mode for mode in FAREWELL_TEXTS if mode != language]
    return step("code", role, source="intros.py · TextTeacher.end", title="Le prof dit au revoir",
                text=f"« {FAREWELL_TEXTS[language]['french']} »",
                hint=f"Toujours le même, pour toutes les tâches : joué tel quel à la fin de la séance, à la place de "
                     f"la dernière prise de parole du prof, en hébreu (page texte, sans mode de langue) ; voix "
                     f"{'enregistrée' if recorded else 'dite à la volée'} ({INTRO_VOICE}, {INTRO_TTS_MODEL}). Puis la "
                     "séance se ferme. Mode texte seulement.",
                parts=tuple((f"Mode {LANGUAGE_NAMES.get(mode, mode)}", FAREWELL_TEXTS[mode]["text"])
                            for mode in modes))


def transcription(raw: str, heard: str, phonetic: str, context: str, label: str = TEACHER_CONTEXT,
                  role: str = "2", phonetic_model: str = PHONETIC_MODELS[0],
                  model_note: str = "menu, défaut", respell: bool = True) -> list[list[dict]]:
    """La réponse orale de l'élève en texte, deux colonnes en parallèle : la transcription hébraïque (raw), puis sa
    remise en lettres hébraïques et, respell, sa relecture (heard, cf. TeacherSession.on_student_audio) ; la
    transcription phonétique (double route voyelle), par phonetic_model. context, label : le contexte de la relecture
    (cf. spelling_context, spelling_label de la tâche)."""
    return [
        [step("model", f"{role}a · Transcription hébraïque", model=TRANSCRIBE_MODEL, source="transcribe.transcribe",
              text="Ce que l'élève a dit, en lettres hébraïques sans voyelles.",
              hint="Tend à ramener un son déformé vers un vrai mot.",
              system="(aucune instruction : modèle de transcription audio, langue « he-IL »)", message=AUDIO,
              output=raw),
         step("model", "puis · lettres hébraïques", model=SPELLING_MODEL, source="transcribe.in_hebrew_letters",
              when="Seulement si la transcription est surtout en lettres latines (exemple à part).",
              system=SCRIPT_PROMPT, message=LATIN_HEARD, output=LATIN_WRITTEN, small=True),
         *([step("model", "puis · relecture de l'orthographe", model=SPELLING_MODEL, source="transcribe.respelled",
                 when="Corrige l'orthographe d'après le contexte ; écartée si elle change la prononciation.",
                 system=SPELLING_PROMPT, message=spelling_request(raw, context, label), output=heard, small=True)]
           if respell else [])],
        [phonetic_step(f"{role}b · Transcription phonétique", phonetic, phonetic_model, model_note,
                       "Lancée en même temps que la transcription hébraïque.")],
    ]


RESPELL_THEN = ("repart comme une nouvelle réponse, avec la même phonétique : une lecture est jugée de nouveau, une "
                "question repart au prof.")


def respell_button(raw: str, heard: str, context: str, label: str = TEACHER_CONTEXT, then: str = RESPELL_THEN) -> dict:
    """Le bouton « orthographe » de la réponse (cf. StudentAnswer, TeacherSession.respell) : la relecture de
    l'orthographe, à la demande de l'élève, au lieu d'être automatique ; then : ce que devient la réponse relue."""
    return step("model", "Bouton « orthographe » (abc ✓)", model=SPELLING_MODEL, source="TeacherSession.respell",
                title="À la demande de l'élève : relit l'orthographe de sa transcription",
                text=f"Sous le crayon. La transcription affichée est relue d'après le contexte, puis la réponse relue "
                     f"{then} Rien à corriger : « Orthographe déjà correcte ».",
                hint="La relecture est écartée si elle change la prononciation (même règle qu'avant).",
                system=SPELLING_PROMPT, message=spelling_request(raw, context, label), output=heard)


def phonetic_step(role: str, phonetic: str, model: str = PHONETIC_MODELS[0], model_note: str = "menu, défaut",
                  when: str = "") -> dict:
    """La transcription phonétique de la réponse enregistrée (double route voyelle, cf. transcribe.heard_phonetic)."""
    return step("model", role, model=model, model_note=model_note, source="transcribe.heard_phonetic",
                text="Ce que l'élève a dit, son par son, en lettres latines (« double route voyelle »).",
                hint=f"Garde les voyelles et les sons tels qu'ils ont été dits. {when}".strip(), system=PHONETIC_PROMPT,
                message=AUDIO, output=phonetic)


def pronunciation_judge(role: str, text: str, phonetic: str, words: list[dict], expected_phonetic: str = "",
                        what: str = "", model: str = PRONUNCIATION_MODELS[0], model_note: str = "menu, défaut") -> dict:
    """Le juge de prononciation (cf. judges.mispronounced) : d'une lecture avec expected_phonetic, d'une réponse
    sinon ; words : sa sortie, un objet par mot (cf. judges.PRONUNCIATION_SCHEMA) ; model : celui de la config."""
    system, message = pronunciation_request(text, phonetic, expected_phonetic)
    return step("model", role, model=model, model_note=model_note,
                source="judges.mispronounced", system=system, message=message, output=as_json(words),
                text=what or "Les mots sont-ils bien prononcés ? Compare, mot par mot, la phonétique entendue à la "
                             "prononciation correcte.",
                items=("faute : autre voyelle ou consonne, syllabe en trop ou en moins, h omis au début du mot ou de "
                       "son préfixe",
                       "remarque verte : forme courante de l'hébreu parlé (ו de liaison, dagesh kal, tséré)",
                       "toléré : accent, petit i/e entre consonnes ou autour d'un y, h au milieu d'un mot"),
                hint="Puis le code range en remarque une variante déjà vérifiée (ACCEPTED_VARIANTS), même si le juge "
                     "l'a oubliée.")


def teacher_voice(said: str, french: str, french_said: str, french_shown: dict,
                  french_speech_model: str = FRENCH_SPEECH_MODEL) -> list[dict]:
    """Ce qui suit chaque prise de parole du prof, en parallèle (cf. TextTeacher._speak, TeacherSession.
    translate_segment) : sa voix, et la traduction de chacune de ses phrases, affichée sous elle. said, french : une
    phrase du prof en hébreu et sa traduction ; french_said, french_shown : une phrase dite en français et ce qui en
    est affiché."""
    return [
        step("model", "La voix du prof", model=TTS_MODELS[0], model_note="menu, défaut", source="tts.speak",
             text="Chaque prise de parole écrite du prof, dite à voix haute, en streaming : l'audio suit le texte.",
             hint=f"Sans instruction système : le ton du prof est joint au texte (sauf gemini-3.1-flash-tts-preview, "
                  f"qui le refuse) ; la voix, {INTRO_VOICE}, est fixe sur la page.",
             message=as_json(speech_input(said, TTS_MODELS[0])), output="[l'audio de la phrase, PCM16 mono 24 kHz]"),
        step("model", "La traduction du prof", model=TRANSLATION_MODEL, source="translate.translate_to_french",
             text="Chaque phrase du prof, traduite en français et affichée sous elle.",
             hint="Sauf l'accueil enregistré, déjà traduit.", system=TRANSLATION_PROMPT, message=said, output=french),
        step("model", "puis · le prof parle français", model=french_speech_model, source="translate.french_speech",
             when="Seulement si sa phrase est surtout en lettres latines : ses mots hébreux réécrits en hébreu ; sa "
                  "traduction en hébreu n'est pas affichée (page texte, sans mode de langue).",
             system=FRENCH_SPEECH_PROMPT, message=french_said, output=as_json(french_shown), small=True),
    ]


def teacher(instructions: str, start_message: str, text: str, task: str = "", language: str = "",
            phonetic: bool = True, model: str = TEXT_TEACHER_MODEL, model_note: str = "mode texte, défaut") -> dict:
    """Le prof en mode texte (cf. TextTeacher.replacing) : les instructions de la tâche et de l'échange écrit (sans la
    prononciation entendue si phonetic est faux, cf. prompts.text_mode), sans mode de langue (cf.
    prompts.without_language_mode), et sa première réplique, l'accueil enregistré
    de la tâche s'il y en a un (cf. TextTeacher._play_intro) ; ses réponses aux messages de l'application : cf. le
    verdict de chaque tâche."""
    entry = intros().get(task, {}).get(language)
    return step("model", "Le prof", model=model, model_note=f"{model_note}, avec une voix TTS",
                source="text_teacher.TextTeacher", text=text,
                system=prompts.without_language_mode(instructions + prompts.text_mode(phonetic)),
                hint="Chaque réplique est nettoyée avant d'être affichée, dite et gardée dans son historique : la ligne "
                     "parasite d'un seul mot latin retirée, et tout caractère arabe retiré (filet de sécurité, le cas "
                     "noté dans le log).",
                message=start_message,
                output=f"{entry['text']}\n\n(l'accueil enregistré, joué à sa place comme sa première réplique)"
                if entry else None)
