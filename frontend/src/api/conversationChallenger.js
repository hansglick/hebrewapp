import { API_URL } from "./http";
import { getIdentity } from "./identity";

// Même technique que api/conversationEval.js (un WebSocket natif ne permet
// pas d'en-têtes personnalisés) — l'identité passe donc en query string,
// cf. app.routers.conversation_challenger qui la lit côté backend.
export function conversationChallengerWebSocketUrl() {
  const wsBase = API_URL.replace(/^http/, "ws");
  const identity = getIdentity();
  const params = new URLSearchParams({
    pseudo: identity?.pseudo ?? "",
    pin: identity?.pin ?? "",
  });
  return `${wsBase}/api/conversation-challenger/ws?${params}`;
}
