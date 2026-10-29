import { API_URL, apiFetch } from "./http";
import { getIdentity } from "./identity";

// Leçons 0.01 → 0.20 qui ont un texte : les seules où la tâche « Lecture » est proposée.
export const getRevisionTexts = () => apiFetch("/api/revision-agent/texts");

// Leçons 0.01 → 0.20 qui apportent des mots ou des verbes : la matière de l'expression libre.
export const getRevisionVocabulary = () => apiFetch("/api/revision-agent/vocabulary");

// Nombre de complétions de chaque leçon 0.01 → 0.20, par case : {leçon: {current, previous}} (concepts de la leçon,
// concepts des leçons antérieures).
export const getCompletionLessons = () => apiFetch("/api/revision-agent/completion");

// Sujets qualifiés d'une tâche au niveau `lesson`, avec leurs exercices (prototype sans agent).
export const getRevisionTopics = (task, lesson) =>
  apiFetch(`/api/revision-agent/topics?${new URLSearchParams({ task, lesson })}`);

// Même technique que api/conversationChallenger.js (un WebSocket natif ne
// permet pas d'en-têtes personnalisés) — l'identité passe donc en query
// string, cf. app.routers.revision_agent qui la lit côté backend.
export function revisionAgentWebSocketUrl({ lesson, voice, task, current, previous, oral = false, perReading = 1 }) {
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
    oral: String(oral),
    per_reading: String(perReading),
  });
  return `${wsBase}/api/revision-agent/ws?${params}`;
}
