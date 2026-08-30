import { API_URL, apiFetch } from "./http";

export async function getJdr(code) {
  return apiFetch(`/api/jdr/${encodeURIComponent(code)}`);
}

// {lesson_code: {role_etudiant, objectif_etudiant}} pour tout le chapitre —
// sert à afficher rôle/mission sur chaque tuile de la liste des
// conversations précédentes sans un aller-retour par leçon.
export async function getJdrChapitre(chapId) {
  return apiFetch(`/api/jdr/chapitre/${encodeURIComponent(chapId)}`);
}

export function jdrWebSocketUrl(code) {
  const wsBase = API_URL.replace(/^http/, "ws");
  return `${wsBase}/api/jdr/${encodeURIComponent(code)}/ws`;
}
