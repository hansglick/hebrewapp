import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
RESULTS_DIR = BACKEND_DIR / "results"
PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"

load_dotenv(BACKEND_DIR / ".env")

FRONTEND_DEV_ORIGIN = "http://localhost:5173"

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = "gemini-3.1-pro-preview"
