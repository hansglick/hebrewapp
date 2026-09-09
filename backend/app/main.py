import shutil

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import BACKEND_DIR, DATA_DIR, FRONTEND_DEV_ORIGIN, RESULTS_DIR
from app.data_loader import DATA_FILES, get_dataset
from app.database import init_db
from app.routers import (
    auth,
    chapters,
    concept,
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
    revision,
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
app.include_router(revision.router)
app.include_router(concept.router)

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

# Dossiers d'assets versionnés dans git (assez légers pour ça, contrairement
# au reste de backend/results/, cf. .gitignore — ex: images_concept) : ils
# vivent dans le checkout du repo (BACKEND_DIR / "results"), distinct du
# disque persistant (RESULTS_DIR) en prod. Sans cette copie au démarrage, un
# simple "git push" ne suffirait pas à les rendre servables, puisque
# StaticFiles(RESULTS_DIR) ne regarde jamais dans le checkout. Ne fait rien
# en local (les deux chemins coïncident déjà). Idempotent (skip si déjà
# copié) pour ne pas retraiter à chaque redémarrage.
_bundled_results_dir = BACKEND_DIR / "results"
if RESULTS_DIR != _bundled_results_dir and _bundled_results_dir.exists():
    for _bundled_item in _bundled_results_dir.iterdir():
        _dest = RESULTS_DIR / _bundled_item.name
        if not _dest.exists():
            if _bundled_item.is_dir():
                shutil.copytree(_bundled_item, _dest)
            else:
                shutil.copy2(_bundled_item, _dest)

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
