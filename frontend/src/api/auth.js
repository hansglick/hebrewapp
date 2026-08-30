// register/login n'utilisent PAS apiFetch (api/http.js) : ces deux requêtes
// envoient pseudo+pin dans le corps, pas en en-têtes — elles précèdent
// l'identité qu'elles servent justement à établir, pas besoin d'y attacher
// une identité (potentiellement absente ou d'un autre compte).
import { API_URL } from "./http";

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

async function authRequest(path, pseudo, pin) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pseudo, pin }),
  });
  if (!res.ok) await throwWithDetail(res, path);
  return res.json();
}

export const registerAccount = (pseudo, pin) => authRequest("/api/auth/register", pseudo, pin);
export const loginAccount = (pseudo, pin) => authRequest("/api/auth/login", pseudo, pin);
