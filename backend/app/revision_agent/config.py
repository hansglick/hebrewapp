"""Modèles et réglages de l'agent de révision (cf. demande explicite du user)."""

LIVE_MODEL = "gemini-3.8-live"  # le prof
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
QUESTION_MODEL = "gemini-3.5-flash"  # tâche « Question » : la question de l'élève vise-t-elle la cible ?
COMPLETION_MODEL = "gemini-3.5-flash"  # tâche « Complétion » : la phrase respecte-t-elle la contrainte, a-t-elle un sens ?
READING_MODEL = "gemini-3.5-flash"  # tâche « Lecture » : la transcription de la lecture comparée au texte
# La phrase que ce modèle attend est envoyée à la fenêtre « Déclinaison », qui l'affiche si l'élève coche la case
# (cf. demande explicite du user), puis retirée à sa demande : False, jamais envoyée, pas de case.
SHOW_DECLENSION_EXPECTED = False

# Périmètre : les 20 premières leçons.
LESSON_CHAPTER = "0"
LAST_LESSON = 20

SAMPLE_RATE = 24000  # audio échangé avec le navigateur : PCM16 mono 24 kHz, dans les deux sens
READING_SILENCE_SECONDS = 3  # silence de l'élève qui marque la fin de sa lecture (cf. demande explicite du user)
GEMINI_SILENCE_MS = 1500  # silence avant que la détection de parole de Gemini considère le tour fini
# Diagnostic des réponses mal entendues (cf. demande explicite du user) : la voix de l'élève est journalisée segment par
# segment, et les dernières secondes du micro sont enregistrées en WAV à chaque évaluation, dans
# results/revision_debug/ (hors git). False : ni journal ni enregistrement.
DEBUG_STUDENT_AUDIO = True
VOICES = {
    "Achernar", "Achird", "Algenib", "Algieba", "Alnilam", "Aoede", "Autonoe", "Callirrhoe", "Charon", "Despina",
    "Enceladus", "Erinome", "Fenrir", "Gacrux", "Iapetus", "Kore", "Laomedeia", "Leda", "Orus", "Puck",
    "Pulcherrima", "Rasalgethi", "Sadachbia", "Sadaltager", "Schedar", "Sulafat", "Umbriel", "Vindemiatrix",
    "Zephyr", "Zubenelgenubi",
}

# Mode de langue du prof au début d'une séance ("he" | "fr") : hébreu, personne n'est censé parler français pendant
# la séance (cf. demande explicite du user).
DEFAULT_LANGUAGE = "he"
