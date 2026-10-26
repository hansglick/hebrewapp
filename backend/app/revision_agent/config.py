"""Modèles et réglages de l'agent de révision (cf. demande explicite du user)."""

LIVE_MODEL = "gemini-3.8-live"  # le prof
TRANSLATION_MODEL = "gemini-3.5-flash-lite"  # traduction en français de ce que dit le prof (qui ne parle qu'hébreu)
EXTRACTOR = {"model": "gemini-3.5-flash-lite", "thinking": "high", "temperature": 0.0}  # verbatim de la lecture
EVALUATOR = {"model": "gpt-6.1-sol", "effort": "medium"}  # comparaison du verbatim au texte attendu

# Périmètre : les 20 premières leçons.
LESSON_CHAPTER = "0"
LAST_LESSON = 20

SAMPLE_RATE = 24000  # audio échangé avec le navigateur : PCM16 mono 24 kHz, dans les deux sens
SILENCE_SECONDS = 2.5  # silence de l'élève qui marque la fin de sa lecture
GEMINI_SILENCE_MS = 1500  # silence avant que la détection de parole de Gemini considère le tour fini
VOICES = {
    "Achernar", "Achird", "Algenib", "Algieba", "Alnilam", "Aoede", "Autonoe", "Callirrhoe", "Charon", "Despina",
    "Enceladus", "Erinome", "Fenrir", "Gacrux", "Iapetus", "Kore", "Laomedeia", "Leda", "Orus", "Puck",
    "Pulcherrima", "Rasalgethi", "Sadachbia", "Sadaltager", "Schedar", "Sulafat", "Umbriel", "Vindemiatrix",
    "Zephyr", "Zubenelgenubi",
}
