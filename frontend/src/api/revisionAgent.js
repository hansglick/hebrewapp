import { API_URL, apiFetch } from "./http";
import { getIdentity } from "./identity";

// Leçons 0.01 → 0.20 qui ont un texte : les seules où la tâche « Lecture » est proposée.
export const getRevisionTexts = () => apiFetch("/api/revision-agent/texts");

// Même technique que api/conversationChallenger.js (un WebSocket natif ne
// permet pas d'en-têtes personnalisés) — l'identité passe donc en query
// string, cf. app.routers.revision_agent qui la lit côté backend.
export function revisionAgentWebSocketUrl({ lesson, voice, task, current, previous }) {
  const wsBase = API_URL.replace(/^http/, "ws");
  const identity = getIdentity();
  const params = new URLSearchParams({
    pseudo: identity?.pseudo ?? "",
    pin: identity?.pin ?? "",
    lesson,
    voice,
    task,
    current: String(current),
    previous: String(previous),
  });
  return `${wsBase}/api/revision-agent/ws?${params}`;
}
