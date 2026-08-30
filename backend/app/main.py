from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import DATA_DIR, FRONTEND_DEV_ORIGIN, RESULTS_DIR
from app.data_loader import DATA_FILES, get_dataset
from app.database import init_db
from app.routers import (
    auth,
    chapters,
    content,
    curiosites,
    evaluations,
    examens,
    gemini_eval,
    hard_exam,
    jdr,
    niveau,
    notifications,
    onboarding,
    practice,
    stats,
    tts,
    wallet,
)

app = FastAPI(title="Hebrew App API")
app.include_router(auth.router)
app.include_router(content.router)
app.include_router(chapters.router)
app.include_router(evaluations.router)
app.include_router(niveau.router)
app.include_router(onboarding.router)
app.include_router(practice.router)
app.include_router(tts.router)
# hard_exam AVANT examens : ses routes littérales ("/examens/hard/...")
# doivent être testées avant "/examens/{code}/..." (examens.router), sinon
# FastAPI matcherait "hard" comme valeur de {code} en premier (même piège
# que active-lockdown, cf. commentaire dans routers/examens.py).
app.include_router(hard_exam.router)
app.include_router(examens.router)
app.include_router(gemini_eval.router)
app.include_router(stats.router)
app.include_router(notifications.router)
app.include_router(wallet.router)
app.include_router(curiosites.router)
app.include_router(jdr.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_DEV_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Sur Render, RESULTS_DIR pointe vers le disque persistant monté : au tout
# premier déploiement (avant que le disque ne soit peuplé), le dossier
# n'existe pas encore et StaticFiles refuse de démarrer sans lui.
RESULTS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=RESULTS_DIR), name="media")
app.mount("/data-media", StaticFiles(directory=DATA_DIR), name="data-media")


@app.on_event("startup")
def preload_data():
    for name in DATA_FILES:
        get_dataset(name)
    init_db()


@app.get("/api/health")
def health():
    return {"status": "ok"}
