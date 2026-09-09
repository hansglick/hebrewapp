import { API_URL, apiFetch } from "./http";
import { getIdentity } from "./identity";

export async function getConceptRevision(code) {
  return apiFetch(`/api/concept/${encodeURIComponent(code)}`);
}

// Même convention que revisionWebSocketUrl (api/revision.js) : l'identité
// passe en query string, un WebSocket natif ne permettant pas d'en-têtes
// personnalisés — cf. app.routers.concept.concept_ws qui la lit côté
// backend.
export function conceptWebSocketUrl(code) {
  const wsBase = API_URL.replace(/^http/, "ws");
  const identity = getIdentity();
  const params = new URLSearchParams({
    pseudo: identity?.pseudo ?? "",
    pin: identity?.pin ?? "",
  });
  return `${wsBase}/api/concept/${encodeURIComponent(code)}/ws?${params}`;
}
