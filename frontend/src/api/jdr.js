const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function throwWithDetail(res, path) {
  let detail = `${path} -> ${res.status}`;
  try {
    const body = await res.json();
    if (body?.detail) detail = body.detail;
  } catch {
    // pas de corps JSON exploitable, on garde le message par défaut
  }
  throw new Error(detail);
}

export async function getJdr(code) {
  const res = await fetch(`${API_URL}/api/jdr/${encodeURIComponent(code)}`);
  if (!res.ok) await throwWithDetail(res, `/api/jdr/${code}`);
  return res.json();
}

// {lesson_code: {role_etudiant, objectif_etudiant}} pour tout le chapitre —
// sert à afficher rôle/mission sur chaque tuile de la liste des
// conversations précédentes sans un aller-retour par leçon.
export async function getJdrChapitre(chapId) {
  const res = await fetch(`${API_URL}/api/jdr/chapitre/${encodeURIComponent(chapId)}`);
  if (!res.ok) await throwWithDetail(res, `/api/jdr/chapitre/${chapId}`);
  return res.json();
}

export function jdrWebSocketUrl(code) {
  const wsBase = API_URL.replace(/^http/, "ws");
  return `${wsBase}/api/jdr/${encodeURIComponent(code)}/ws`;
}
