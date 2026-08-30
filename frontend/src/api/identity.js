// Identité multi-utilisateurs légère (pseudo + code PIN, pas une vraie
// authentification) — stockée en localStorage, un identifiant par
// appareil/navigateur. Fonctions plates (pas un hook) : utilisées depuis
// api/http.js en dehors de tout composant React.
const KEY = "identity";

export function getIdentity() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function setIdentity(pseudo, pin) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ pseudo, pin }));
  } catch {
    // stockage indisponible (navigation privée stricte...) — l'identité ne
    // survivra pas au reload, mais la session en cours continue de fonctionner.
  }
}

export function clearIdentity() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // rien à faire si le stockage est déjà inaccessible
  }
}
