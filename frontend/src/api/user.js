import { apiFetch, apiFetchJson } from "./http";

export const getNiveau = () => apiFetch("/api/niveau");

// Marque toutes les notifications comme lues côté serveur (effet de bord) —
// utiliser getUnreadNotificationCount (api/content.js) pour un simple
// comptage sans y toucher.
export const getNotifications = () => apiFetch("/api/notifications");

export const updateNiveau = (level) => apiFetchJson("/api/niveau", { level }, "PUT");

export const createEvaluation = ({ objectType, objectKey, success, score }) =>
  apiFetchJson("/api/evaluations", { object_type: objectType, object_key: objectKey, success, score });

// Marque un objet comme vu au moins une fois — jamais attendue par
// l'appelant (fire-and-forget), pour ne jamais impacter le timing UI
// existant. Sert au calcul de la progression d'exploration d'une leçon.
export function markObjectSeen({ objectType, objectKey }) {
  apiFetchJson("/api/object-views", { object_type: objectType, object_key: objectKey }).catch(() => {});
}

export const getExamReadiness = () => apiFetch("/api/examens/readiness");

export const getEvaluations = ({ objectType, objectKey, limit = 5 }) => {
  const params = new URLSearchParams({ object_type: objectType, object_key: objectKey, limit });
  return apiFetch(`/api/evaluations?${params}`);
};

export const getExamenStatus = (code) => apiFetch(`/api/examens/${encodeURIComponent(code)}/status`);

export const getSessionExists = (code) => apiFetch(`/api/examens/${encodeURIComponent(code)}/session-exists`);

export const getActiveLockdown = () => apiFetch("/api/examens/active-lockdown");

export const abandonExamen = (code, examType) =>
  apiFetchJson(`/api/examens/${encodeURIComponent(code)}/abandon`, { exam_type: examType });

export const answerExamen = (code, { examType, questionIndex, answer, pauseSeconds = 0 }) =>
  apiFetchJson(`/api/examens/${encodeURIComponent(code)}/answer`, {
    exam_type: examType,
    question_index: questionIndex,
    answer,
    pause_seconds: pauseSeconds,
  });

export const abandonExamenHard = () => apiFetch("/api/examens/hard/abandon", { method: "POST" });

export const answerExamenHard = ({ questionIndex, answer, pauseSeconds = 0 }) =>
  apiFetchJson("/api/examens/hard/answer", {
    question_index: questionIndex,
    answer,
    pause_seconds: pauseSeconds,
  });

// Déclenche aussi côté serveur le tick d'inactivité (perte de cartes,
// notifications de palier) — cf. app.wallet.tick_inactivite_et_notifications.
export const getWallet = () => apiFetch("/api/wallet");

const walletAction = (path, nom) => apiFetchJson(`/api/wallet/${path}`, { nom });

export const openLot = (nom) => walletAction("lots/open", nom);

// Consomme 1 gem pour révéler la fiche (nom + bio) d'une carte possédée.
export const viewCarteFiche = (index) => apiFetch(`/api/wallet/cartes/${index}/view`, { method: "POST" });
