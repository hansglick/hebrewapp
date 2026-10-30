"""Journal des requêtes de toute l'app (cf. demande explicite du user) : qui fait quoi, et quand. Une ligne JSON par
requête API (ou connexion WebSocket) dans JOURNALS_DIR/requests/AAAA-MM-JJ.jsonl (jour UTC), sur le disque persistant
à côté de la base, et une ligne dans les logs (visibles dans le dashboard de Render).

Chaque ligne : {"at": heure ISO (UTC), "pseudo", "ip", "method", "path", "query", "status", "ms"} ; pour un
WebSocket, "method" vaut "WS", une ligne "ws_open" est écrite à l'ouverture et "ms" donne la durée de la connexion.
Le pseudo est celui qu'annonce la requête (en-tête X-Pseudo, ou paramètre pseudo des WebSockets et des pages sans
apiFetch), sans vérification du PIN ; le PIN n'est jamais écrit.

Ne vont pas au journal : les appels automatiques du frontend (active-lockdown toutes les 5 s, wallet toutes les 30 s,
cf. frontend/src/layout/Layout.jsx), le contrôle de santé, les pré-requêtes CORS et les fichiers statiques.

Un échec d'écriture n'affecte jamais la requête : il est seulement signalé dans les logs.
"""

import json
import logging
import time
from collections import Counter
from datetime import datetime, timezone
from urllib.parse import parse_qsl, unquote

from app.config import JOURNALS_DIR

log = logging.getLogger("hebrew_app.requests")
if not log.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(asctime)s requête | %(message)s"))
    log.addHandler(_handler)
    log.setLevel(logging.INFO)
    log.propagate = False

REQUESTS_DIR = JOURNALS_DIR / "requests"
SKIPPED_PATHS = {"/api/health", "/api/examens/active-lockdown", "/api/wallet"}
SKIPPED_PREFIXES = ("/media/", "/data-media/")
HIDDEN_PARAMS = {"pin", "pseudo"}  # le PIN n'est jamais écrit ; le pseudo a son propre champ


def skipped(scope: dict) -> bool:
    path = scope["path"]
    if scope["type"] == "http" and scope["method"] in ("OPTIONS", "HEAD"):
        return True
    if path in SKIPPED_PATHS and scope.get("method", "GET") == "GET":
        return True
    return path.startswith(SKIPPED_PREFIXES) or not path.startswith("/api/")


def identity(scope: dict, params: list[tuple[str, str]]) -> str | None:
    for name, value in scope.get("headers", []):
        if name == b"x-pseudo":
            return unquote(value.decode("latin-1"))
    return next((value for name, value in params if name == "pseudo"), None)


def write(line: dict) -> None:
    try:
        REQUESTS_DIR.mkdir(parents=True, exist_ok=True)
        with open(REQUESTS_DIR / f"{line['at'][:10]}.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps(line, ensure_ascii=False) + "\n")
    except Exception:
        log.exception("Écriture du journal des requêtes impossible")


class RequestJournal:
    """Middleware ASGI (HTTP et WebSocket) : cf. docstring du module."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] not in ("http", "websocket") or skipped(scope):
            return await self.app(scope, receive, send)
        params = parse_qsl(scope.get("query_string", b"").decode("latin-1"))
        line = {"pseudo": identity(scope, params), "ip": (scope.get("client") or ("?",))[0],
                "method": scope.get("method", "WS"), "path": scope["path"],
                "query": {k: v for k, v in params if k not in HIDDEN_PARAMS} or None}
        status = {}

        async def send_status(message):
            kind = message["type"]
            if kind == "http.response.start":
                status["code"] = message["status"]
            elif kind == "websocket.accept":
                status["code"] = 101
            elif kind == "websocket.close":
                status.setdefault("code", 403)  # fermé sans avoir été accepté : refusé
            await send(message)

        started = time.monotonic()
        if scope["type"] == "websocket":
            write({"at": now_iso(), "event": "ws_open", **line})
        try:
            await self.app(scope, receive, send_status)
        except Exception:
            status.setdefault("code", 500)
            raise
        finally:
            ms = round((time.monotonic() - started) * 1000)
            write({"at": now_iso(), **line, "status": status.get("code"), "ms": ms})
            log.info("%s %s %s %s %d ms", line["pseudo"] or "-", line["method"], line["path"], status.get("code"), ms)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def summarize(day: str | None = None) -> dict[str, dict]:
    """Activité d'un jour (AAAA-MM-JJ, UTC ; par défaut aujourd'hui), par pseudo : nombre de requêtes, première et
    dernière, routes les plus appelées. Usage : python -c "from app.request_journal import summarize; print(summarize())"
    """
    path = REQUESTS_DIR / f"{day or now_iso()[:10]}.jsonl"
    users: dict[str, dict] = {}
    if not path.exists():
        return users
    for raw in path.read_text(encoding="utf-8").splitlines():
        try:
            r = json.loads(raw)
        except ValueError:
            continue
        if r.get("event") == "ws_open":
            continue
        u = users.setdefault(r["pseudo"] or "-", {"requests": 0, "first": r["at"], "last": r["at"], "routes": Counter()})
        u["requests"] += 1
        u["last"] = r["at"]
        u["routes"][f"{r['method']} {r['path']}"] += 1
    for u in users.values():
        u["routes"] = dict(u["routes"].most_common(10))
    return users
