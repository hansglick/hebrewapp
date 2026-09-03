import { API_URL, apiFetch } from "./http";
import { getIdentity } from "./identity";

export async function getRevision(code) {
  return apiFetch(`/api/revision/${encodeURIComponent(code)}`);
}

// Un WebSocket natif ne permet pas d'en-têtes personnalisés (contrairement à
// apiFetch/X-Pseudo) — l'identité (pseudo hébreu + pin) passe donc en query
// string ; URLSearchParams encode le pseudo hébreu pour nous, cf.
// app.routers.revision.revision_ws qui la lit côté backend.
export function revisionWebSocketUrl(code) {
  const wsBase = API_URL.replace(/^http/, "ws");
  const identity = getIdentity();
  const params = new URLSearchParams({
    pseudo: identity?.pseudo ?? "",
    pin: identity?.pin ?? "",
  });
  return `${wsBase}/api/revision/${encodeURIComponent(code)}/ws?${params}`;
}
