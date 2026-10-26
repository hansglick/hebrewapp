"""Agent de révision (/dev/revision-agent) : un prof Gemini Live 3.8 fait réviser une leçon (0.01 → 0.20) à
l'étudiant, tâche par tâche. Seule la tâche « Lecture » est branchée pour l'instant (cf. reading.py) — reprise
du prototype livecoach : le prof (Gemini Live) anime la séance en hébreu, un extracteur (Gemini Flash-Lite)
écrit le verbatim phonétique de la lecture, un évaluateur (Sol) le compare au texte attendu."""
