import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
# En prod (Render), RESULTS_DIR pointe vers le disque persistant monté (le
# système de fichiers du service lui-même est éphémère, remis à zéro à
# chaque déploiement) ; en local, la valeur par défaut ne change pas.
RESULTS_DIR = Path(os.environ.get("RESULTS_DIR", str(BACKEND_DIR / "results")))
# Journaux d'activité (séances de revision-agent, requêtes) : à côté de la base, sur le disque persistant en prod
# (/var/data/journals), et SURTOUT PAS dans RESULTS_DIR, que /media sert publiquement (cf. app.main) : ils contiennent
# pseudos et transcriptions.
JOURNALS_DIR = Path(os.environ.get("DB_PATH", str(BACKEND_DIR / "db.sqlite3"))).parent / "journals"
PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"

load_dotenv(BACKEND_DIR / ".env")

# En prod (Render), FRONTEND_ORIGIN pointe vers l'URL réelle du frontend
# déployé ; en local, la valeur par défaut ne change pas.
FRONTEND_DEV_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173")

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = "gemini-3.1-pro-preview"

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
OPENAI_TRANSCRIBE_MODEL = "whisper-1"
