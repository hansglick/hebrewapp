// register/login n'utilisent PAS apiFetch (api/http.js) : ces deux requêtes
// envoient pseudo+pin dans le corps, pas en en-têtes — elles précèdent
// l'identité qu'elles servent justement à établir, pas besoin d'y attacher
// une identité (potentiellement absente ou d'un autre compte).
import { API_URL } from "./http";

async function throwWithDetail(res, path) {
  let detail = `${path} -> ${res.status}`;
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") {
      detail = body.detail;
    } else if (Array.isArray(body?.detail)) {
      // Erreur de validation FastAPI (422) : detail est un tableau
      // d'objets {loc, msg, type}, pas une chaîne — cf. même bug corrigé
      // dans api/http.js::throwWithDetail.
      detail = body.detail.map((e) => e?.msg ?? JSON.stringify(e)).join(" ; ");
    } else if (body?.detail) {
      detail = JSON.stringify(body.detail);
    }
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
