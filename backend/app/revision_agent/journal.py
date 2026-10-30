"""Journal des séances de /dev/revision-agent (cf. demande explicite du user) : un fichier JSON Lines par séance, sur le
disque persistant (RESULTS_DIR/revision_sessions, /var/data/results sur Render, cf. render.yaml), qui survit aux
déploiements et ne dépend pas de la durée de conservation des logs de Render.

Chaque ligne : {"t": secondes depuis l'ouverture de la séance, "at": heure ISO, "event": type, ...données}. La première
("session_open") décrit la séance (compte, tâche, leçon, cases cochées) ; la dernière ("session_close") donne sa durée.
Entre les deux : ce que dit le prof et ce qu'il entend de l'élève, ses appels de fonction et les réponses de
l'application, les messages au navigateur (exercices, évaluations, indices, score…) et les actions de l'élève.

À la fermeture, une ligne résume la séance dans summary.jsonl (compte, tâche, leçon, début, fin, durée totale et durée
en ligne avec le prof) : le temps passé sur chaque tâche par compte s'en déduit directement (cf. summarize).

Un échec d'écriture n'interrompt jamais la séance : il est seulement signalé dans les logs.
"""

import json
import logging
import re
import time
import uuid
from datetime import datetime, timezone

from app.config import RESULTS_DIR

log = logging.getLogger("revision_agent.journal")

JOURNAL_DIR = RESULTS_DIR / "revision_sessions"
SUMMARY = JOURNAL_DIR / "summary.jsonl"
# Messages au navigateur qui ne vont pas au journal : la parole du prof y est déjà, en entier (cf. teacher).
SKIPPED_BROWSER_MESSAGES = {"teacher"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class SessionJournal:
    def __init__(self, user_id: int, pseudo: str, task: str, lesson: str, **params):
        self.id = uuid.uuid4().hex[:8]
        self.user_id, self.pseudo, self.task, self.lesson = user_id, pseudo, task, lesson
        self.opened = time.monotonic()
        self.opened_at = now_iso()
        self.live_at: float | None = None  # le prof est en ligne (événement « started »)
        self.closed = False
        safe = re.sub(r"[^\w-]+", "_", pseudo, flags=re.UNICODE)[:30] or "anonyme"
        self.path = JOURNAL_DIR / f"{datetime.now():%Y%m%d-%H%M%S}_{safe}_{task}_{self.id}.jsonl"
        try:
            JOURNAL_DIR.mkdir(parents=True, exist_ok=True)
        except Exception:
            log.exception("Dossier du journal impossible à créer : %s", JOURNAL_DIR)
        self.write("session_open", session=self.id, user_id=user_id, pseudo=pseudo, task=task, lesson=lesson, **params)

    def write(self, event: str, **data) -> None:
        if self.closed:
            return
        line = {"t": round(time.monotonic() - self.opened, 2), "at": now_iso(), "event": event, **data}
        try:
            with open(self.path, "a", encoding="utf-8") as f:
                f.write(json.dumps(line, ensure_ascii=False, default=str) + "\n")
        except Exception:
            log.exception("Écriture du journal impossible : %s", self.path)

    def live(self) -> None:
        if self.live_at is None:
            self.live_at = time.monotonic()
        self.write("live")

    def close(self, reason: str, **data) -> None:
        if self.closed:
            return
        ended = time.monotonic()
        duration = round(ended - self.opened, 1)
        live = round(ended - self.live_at, 1) if self.live_at is not None else 0.0
        self.write("session_close", reason=reason, duration_s=duration, live_s=live, **data)
        self.closed = True
        summary = {"session": self.id, "user_id": self.user_id, "pseudo": self.pseudo, "task": self.task,
                   "lesson": self.lesson, "started_at": self.opened_at, "ended_at": now_iso(), "duration_s": duration,
                   "live_s": live, "reason": reason, "file": self.path.name, **data}
        try:
            with open(SUMMARY, "a", encoding="utf-8") as f:
                f.write(json.dumps(summary, ensure_ascii=False, default=str) + "\n")
        except Exception:
            log.exception("Écriture du résumé impossible : %s", SUMMARY)
        log.info("séance %s fermée (%s) : %s · %s · %.0f s", self.id, reason, self.pseudo, self.task, duration)


def summarize() -> dict[str, dict[str, dict]]:
    """Temps passé par compte et par tâche, d'après summary.jsonl : {pseudo: {tâche: {"sessions", "duration_s",
    "live_s"}}}. Usage : .venv/Scripts/python.exe -c "from app.revision_agent.journal import summarize; print(summarize())"
    """
    totals: dict[str, dict[str, dict]] = {}
    if not SUMMARY.exists():
        return totals
    for line in SUMMARY.read_text(encoding="utf-8").splitlines():
        try:
            s = json.loads(line)
        except ValueError:
            continue
        entry = totals.setdefault(s["pseudo"], {}).setdefault(s["task"], {"sessions": 0, "duration_s": 0.0,
                                                                            "live_s": 0.0})
        entry["sessions"] += 1
        entry["duration_s"] = round(entry["duration_s"] + s.get("duration_s", 0), 1)
        entry["live_s"] = round(entry["live_s"] + s.get("live_s", 0), 1)
    return totals
