import { getIdentity } from "./identity";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

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

// Point de passage unique pour tous les appels API — attache l'identité
// (pseudo + code PIN) courante en en-têtes sur chaque requête. Les valeurs
// d'en-tête HTTP sont limitées à ASCII/Latin-1 par la norme (fetch() lève
// même une TypeError sur un header contenant des caractères hors Latin-1) :
// le pseudo hébreu doit donc être encodé en pourcentage avant d'y être posé
// (décodé côté backend, cf. app.auth.get_current_user_id).
export async function apiFetch(path, options = {}) {
  const identity = getIdentity();
  const headers = { ...(options.headers || {}) };
  if (identity) {
    headers["X-Pseudo"] = encodeURIComponent(identity.pseudo);
    headers["X-Pin"] = identity.pin;
  }
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) await throwWithDetail(res, path);
  return res.json();
}

export function apiFetchJson(path, body, method = "POST") {
  return apiFetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
