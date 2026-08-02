from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import FRONTEND_DEV_ORIGIN, RESULTS_DIR
from app.data_loader import DATA_FILES, get_dataset
from app.database import init_db
from app.routers import chapters, content, evaluations, examens, gemini_eval, niveau, practice, tts

app = FastAPI(title="Hebrew App API")
app.include_router(content.router)
app.include_router(chapters.router)
app.include_router(evaluations.router)
app.include_router(niveau.router)
app.include_router(practice.router)
app.include_router(tts.router)
app.include_router(examens.router)
app.include_router(gemini_eval.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_DEV_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/media", StaticFiles(directory=RESULTS_DIR), name="media")


@app.on_event("startup")
def preload_data():
    for name in DATA_FILES:
        get_dataset(name)
    init_db()


@app.get("/api/health")
def health():
    return {"status": "ok"}
