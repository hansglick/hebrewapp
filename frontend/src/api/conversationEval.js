import { API_URL, apiFetchJson } from "./http";
import { getIdentity } from "./identity";

// Même technique que api/revision.js::revisionWebSocketUrl (un WebSocket
// natif ne permet pas d'en-têtes personnalisés) — l'identité passe donc en
// query string, cf. app.routers.conversation_eval qui la lit côté backend.
export function conversationEvalWebSocketUrl() {
  const wsBase = API_URL.replace(/^http/, "ws");
  const identity = getIdentity();
  const params = new URLSearchParams({
    pseudo: identity?.pseudo ?? "",
    pin: identity?.pin ?? "",
  });
  return `${wsBase}/api/conversation-eval/ws?${params}`;
}

// Applique réellement le niveau estimé par l'algorithme de placement —
// écrit en base (cf. app.routers.conversation_eval.apply_placement), unique
// effet de bord persistant de ce test conversationnel jusqu'ici.
export const applyConversationEvalPlacement = (startLesson) =>
  apiFetchJson("/api/conversation-eval/apply-placement", { start_lesson: startLesson });
