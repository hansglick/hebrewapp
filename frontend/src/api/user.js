const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export async function getNiveau() {
  const res = await fetch(`${API_URL}/api/niveau`);
  if (!res.ok) throw new Error(`/api/niveau -> ${res.status}`);
  return res.json();
}

// Marque toutes les notifications comme lues côté serveur (effet de bord) —
// utiliser getUnreadNotificationCount (api/content.js) pour un simple
// comptage sans y toucher.
export async function getNotifications() {
  const res = await fetch(`${API_URL}/api/notifications`);
  if (!res.ok) throw new Error(`/api/notifications -> ${res.status}`);
  return res.json();
}

export async function updateNiveau(level) {
  const res = await fetch(`${API_URL}/api/niveau`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level }),
  });
  if (!res.ok) throw new Error(`/api/niveau -> ${res.status}`);
  return res.json();
}

export async function createEvaluation({ objectType, objectKey, success, score }) {
  const res = await fetch(`${API_URL}/api/evaluations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      object_type: objectType,
      object_key: objectKey,
      success,
      score,
    }),
  });
  if (!res.ok) throw new Error(`/api/evaluations -> ${res.status}`);
  return res.json();
}

// Marque un objet comme vu au moins une fois — jamais attendue par
// l'appelant (fire-and-forget), pour ne jamais impacter le timing UI
// existant. Sert au calcul de la progression d'exploration d'une leçon.
export function markObjectSeen({ objectType, objectKey }) {
  fetch(`${API_URL}/api/object-views`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ object_type: objectType, object_key: objectKey }),
  }).catch(() => {});
}

export async function getExamReadiness() {
  const res = await fetch(`${API_URL}/api/examens/readiness`);
  if (!res.ok) throw new Error(`/api/examens/readiness -> ${res.status}`);
  return res.json();
}

export async function getEvaluations({ objectType, objectKey, limit = 5 }) {
  const params = new URLSearchParams({
    object_type: objectType,
    object_key: objectKey,
    limit,
  });
  const res = await fetch(`${API_URL}/api/evaluations?${params}`);
  if (!res.ok) throw new Error(`/api/evaluations -> ${res.status}`);
  return res.json();
}

export async function getExamenStatus(code) {
  const res = await fetch(`${API_URL}/api/examens/${encodeURIComponent(code)}/status`);
  if (!res.ok) throw new Error(`/api/examens/${code}/status -> ${res.status}`);
  return res.json();
}

export async function getSessionExists(code) {
  const res = await fetch(`${API_URL}/api/examens/${encodeURIComponent(code)}/session-exists`);
  if (!res.ok) throw new Error(`/api/examens/${code}/session-exists -> ${res.status}`);
  return res.json();
}

export async function getActiveLockdown() {
  const res = await fetch(`${API_URL}/api/examens/active-lockdown`);
  if (!res.ok) throw new Error(`/api/examens/active-lockdown -> ${res.status}`);
  return res.json();
}

export async function abandonExamen(code, examType) {
  const res = await fetch(`${API_URL}/api/examens/${encodeURIComponent(code)}/abandon`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exam_type: examType }),
  });
  if (!res.ok) throw new Error(`/api/examens/${code}/abandon -> ${res.status}`);
  return res.json();
}

export async function answerExamen(code, { examType, questionIndex, answer, pauseSeconds = 0 }) {
  const res = await fetch(`${API_URL}/api/examens/${encodeURIComponent(code)}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      exam_type: examType,
      question_index: questionIndex,
      answer,
      pause_seconds: pauseSeconds,
    }),
  });
  if (!res.ok) {
    let detail = `/api/examens/${code}/answer -> ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // pas de corps JSON exploitable, on garde le message par défaut
    }
    throw new Error(detail);
  }
  return res.json();
}

export async function abandonExamenHard() {
  const res = await fetch(`${API_URL}/api/examens/hard/abandon`, { method: "POST" });
  if (!res.ok) throw new Error(`/api/examens/hard/abandon -> ${res.status}`);
  return res.json();
}

export async function answerExamenHard({ questionIndex, answer, pauseSeconds = 0 }) {
  const res = await fetch(`${API_URL}/api/examens/hard/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question_index: questionIndex, answer, pause_seconds: pauseSeconds }),
  });
  if (!res.ok) {
    let detail = `/api/examens/hard/answer -> ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // pas de corps JSON exploitable, on garde le message par défaut
    }
    throw new Error(detail);
  }
  return res.json();
}

// Déclenche aussi côté serveur le tick d'inactivité (perte de cartes,
// notifications de palier) — cf. app.wallet.tick_inactivite_et_notifications.
export async function getWallet() {
  const res = await fetch(`${API_URL}/api/wallet`);
  if (!res.ok) throw new Error(`/api/wallet -> ${res.status}`);
  return res.json();
}

async function _walletAction(path, nom) {
  const res = await fetch(`${API_URL}/api/wallet/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nom }),
  });
  if (!res.ok) {
    let detail = `/api/wallet/${path} -> ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // pas de corps JSON exploitable, on garde le message par défaut
    }
    throw new Error(detail);
  }
  return res.json();
}

export function openLot(nom) {
  return _walletAction("lots/open", nom);
}

// Consomme 1 gem pour révéler la fiche (nom + bio) d'une carte possédée.
export async function viewCarteFiche(index) {
  const res = await fetch(`${API_URL}/api/wallet/cartes/${index}/view`, { method: "POST" });
  if (!res.ok) {
    let detail = `/api/wallet/cartes/${index}/view -> ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // pas de corps JSON exploitable, on garde le message par défaut
    }
    throw new Error(detail);
  }
  return res.json();
}
