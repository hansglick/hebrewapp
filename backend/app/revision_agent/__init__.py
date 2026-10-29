"""Agent de révision (/dev/revision-agent) : un prof Gemini Live 3.8 fait réviser une leçon (0.01 → 0.20) à
l'étudiant, tâche par tâche (lecture, compréhension de texte, expression libre, déclinaison, question…). Le verbatim de l'élève
vient toujours de Gemini Live ; des modèles rapides (Gemini Flash) complètent l'évaluation au besoin."""

import logging

# Uvicorn ne configure que ses propres loggers : sans ce handler, le déroulé des séances (ce que dit le prof,
# ce qu'il a entendu de l'élève, ses appels de fonction, ses interruptions) n'apparaîtrait dans aucun log,
# ni en local ni sur Render.
_log = logging.getLogger("revision_agent")
_log.setLevel(logging.INFO)
if not _log.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(asctime)s %(name)s | %(message)s"))
    _log.addHandler(_handler)
