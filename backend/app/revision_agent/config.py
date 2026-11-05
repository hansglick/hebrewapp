"""Modèles et réglages de l'agent de révision (cf. demande explicite du user)."""

LIVE_MODEL = "gemini-3.8-live"  # le prof
# Tarif de LIVE_MODEL (ai.google.dev/gemini-api/docs/pricing, niveau payant), en dollars par million de tokens, par
# modalité ; la réflexion du modèle est facturée comme la sortie texte. Sert à la facture de fin de séance.
LIVE_PRICES = {"input": {"TEXT": 0.75, "AUDIO": 3.00, "IMAGE": 1.00, "VIDEO": 1.00},
               "output": {"TEXT": 4.50, "AUDIO": 12.00}}
# Tarif des modèles Flash appelés pendant la séance (traduction, jugements), en dollars par million de tokens :
# (entrée, sortie réflexion comprise). gemini-3.5-flash-lite : page des tarifs ; gemini-3.5-flash n'y figure plus,
# tarif relevé sur les comparateurs de prix (à vérifier).
# gemini-3.5-transcribe (page des tarifs) : entrée audio, sortie texte. gemini-3.8-flash au tarif de lancement (cf.
# TEXT_TEACHER_MODELS) ; appelés sur l'audio (cf. PHONETIC_MODELS), les Flash sont comptés au tarif de l'entrée texte
# (à vérifier).
# Modèles TTS (page des tarifs) : entrée texte, sortie audio ; ceux en 3.8 au tarif valable jusqu'à fin 2026, doublé
# ensuite.
FLASH_PRICES = {"gemini-3.5-flash-lite": (0.30, 2.50), "gemini-3.5-flash": (1.50, 9.00), "gemini-3.8-flash": (0.75, 3.75),
                "gemini-3.5-transcribe": (2.00, 12.00), "gemini-3.5-transcribe-live": (3.50, 21.00),
                "gemini-3.8-flash-tts": (0.50, 9.00),
                "gemini-3.8-flash-lite-tts": (0.50, 6.00), "gemini-3.1-flash-tts-preview": (1.00, 20.00)}
# Page « mode texte » (cf. demande explicite du user) : le prof est ce modèle texte, sans voix, appelé à chaque prise
# de parole (cf. text_teacher.py), choisi sur la page parmi ceux-ci (cf. demande explicite du user). Tarif en dollars
# par million de tokens, entrée lue en cache à part : page des tarifs, sauf gemini-3.5-flash, absent de la page
# (comparateurs de prix, cache supposé à 10 %, à vérifier) ; gemini-3.8-flash au tarif de lancement, valable jusqu'à
# fin 2026, doublé ensuite. Par défaut gemini-3.5-flash-lite : gemini-3.8-flash met 4 à 13 s par prise de parole.
TEXT_TEACHER_MODELS = {
    "gemini-3.8-flash": {"input": 0.75, "cached": 0.075, "output": 3.75},
    "gemini-3.5-flash": {"input": 1.50, "cached": 0.15, "output": 9.00},
    "gemini-3.5-flash-lite": {"input": 0.30, "cached": 0.03, "output": 2.50},
}
TEXT_TEACHER_MODEL = "gemini-3.5-flash-lite"
# Mode texte : la réponse que l'élève enregistre (au lieu de l'écrire) est transcrite par ce modèle (cf. transcribe.py).
TRANSCRIBE_MODEL = "gemini-3.5-transcribe"
# Lecture avec le tri lecture / question (FAST, SHARP) : transcrite pendant que l'élève parle (cf. live_transcribe.py).
LIVE_TRANSCRIBE_MODEL = "gemini-3.5-transcribe-live"
# Mode texte, case « Double route voyelle » (cf. demande explicite du user) : la réponse enregistrée est aussi transcrite
# en lettres latines, voyelles comprises, par l'un de ces modèles, choisi sur la page, en même temps que la
# transcription hébraïque (cf. transcribe.heard_phonetic) ; pour ces tâches seulement. Le premier, celui par défaut :
# gemini-3.8-flash (cf. demande explicite du user).
PHONETIC_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash"]
VOWEL_ROUTE_TASKS = ["lecture", "expression", "comprehension"]
# Double route voyelle, les trois tâches : la prononciation jugée à part, en comparant la prononciation entendue au mot
# transcrit ou au texte lu (cf. judges.mispronounced), par l'un de ces modèles, choisi sur la page (cf. demande
# explicite du user) ; Flash par défaut (cf. demande explicite du user : le plus juste au banc d'essai).
PRONUNCIATION_MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite"]
# Orthographe de la transcription relue d'après le contexte, prononciation inchangée (cf. transcribe.respelled).
SPELLING_MODEL = "gemini-3.5-flash-lite"
# Mode texte : la voix du prof, choisie sur la page parmi ces modèles TTS (cf. tts.py, demande explicite du user).
# Premier morceau d'audio en 2 à 3 s pour chacun (mesuré).
TTS_MODELS = ["gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview"]
TRANSLATION_MODEL = "gemini-3.5-flash-lite"  # traduction en français de ce que dit le prof (qui ne parle qu'hébreu)
# Ce que le prof dit en français (évaluation orale) : mots hébreux transcrits en lettres latines réécrits en hébreu, et
# traduction en hébreu ; le modèle « lite » s'y trompe (mots arabes, coquilles).
FRENCH_SPEECH_MODEL = "gemini-3.5-flash"
EVALUATOR = {"model": "gpt-6.1-sol", "effort": "medium"}  # scripts de préparation des données (scripts/build_revision_*)

# Compréhension avec évaluation orale : pendant la conversation qui suit une évaluation, une phrase hébraïque qui
# répond à la question affichée est évaluée d'office comme un nouvel essai (cf. demande explicite du user). False :
# retour à la version précédente, où l'élève doit demander à retenter (ou cliquer « Redonner ma réponse »).
AUTO_RETRY = True

# Expression libre : après une réponse parfaite, l'élève décline sa phrase ; ce modèle y repère l'élément à décliner et
# écrit la phrase attendue (1 à 2 s, pendant que le prof félicite l'élève). gemini-3.8-flash : même qualité sur nos
# tests, mais deux fois plus lent.
DECLENSION_MODEL = "gemini-3.5-flash"
# Tâche « Déclinaison », mode texte : la phrase redite, différente de la phrase attendue, est jugée par ce modèle, qui
# écrit aussi la réplique du prof (cf. sentence_declension.judge, demande explicite du user).
DECLENSION_JUDGE_MODEL = "gemini-3.5-flash"
# Contrainte et plausibilité de la phrase de l'élève (complétion, question, expression libre), cf. judges.judge_sentence.
JUDGE_MODEL = "gemini-3.5-flash"
READING_MODEL = "gemini-3.5-flash"  # tâche « Lecture » : la transcription de la lecture comparée au texte
# La phrase que ce modèle attend est envoyée à la fenêtre « Déclinaison », qui l'affiche si l'élève coche la case
# (cf. demande explicite du user), puis retirée à sa demande : False, jamais envoyée, pas de case.
SHOW_DECLENSION_EXPECTED = False

# Périmètre : les 30 premières leçons.
LESSON_CHAPTER = "0"
LAST_LESSON = 30
# « Leçons antérieures » au niveau N : seulement les leçons N-20 → N-1, et leurs concepts (cf. demande explicite du
# user) ; jusqu'au niveau 20, toutes les leçons antérieures.
REVISION_SPAN = 20

SAMPLE_RATE = 24000  # audio échangé avec le navigateur : PCM16 mono 24 kHz, dans les deux sens
READING_SILENCE_SECONDS = 3  # silence de l'élève qui marque la fin de sa lecture (cf. demande explicite du user)
GEMINI_SILENCE_MS = 1500  # silence avant que la détection de parole de Gemini considère le tour fini
# Diagnostic des réponses mal entendues (cf. demande explicite du user) : la voix de l'élève est journalisée segment par
# segment, et les dernières secondes du micro sont enregistrées en WAV à chaque évaluation, dans
# results/revision_debug/ (hors git). False : ni journal ni enregistrement.
DEBUG_STUDENT_AUDIO = False
VOICES = {
    "Achernar", "Achird", "Algenib", "Algieba", "Alnilam", "Aoede", "Autonoe", "Callirrhoe", "Charon", "Despina",
    "Enceladus", "Erinome", "Fenrir", "Gacrux", "Iapetus", "Kore", "Laomedeia", "Leda", "Orus", "Puck",
    "Pulcherrima", "Rasalgethi", "Sadachbia", "Sadaltager", "Schedar", "Sulafat", "Umbriel", "Vindemiatrix",
    "Zephyr", "Zubenelgenubi",
}

# Débit du prof (cf. demande explicite du user) : True, vif et naturel en mode français, lent et clair en mode hébreu
# (et pour l'hébreu cité en mode français) ; False, retour au débit d'origine, lent et clair partout.
FAST_FRENCH_SPEECH = True

# Mode de langue du prof au début d'une séance ("he" | "fr"), par tâche (cf. demande explicite du user).
DEFAULT_LANGUAGES = {
    "lecture": "he",
    "comprehension": "he",
    "expression": "fr",
    "declinaison": "fr",
    "completion": "fr",
    "question": "fr",
}
