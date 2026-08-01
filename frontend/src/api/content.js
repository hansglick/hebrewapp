const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function fetchJson(path) {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

export const getChapitres = () => fetchJson("/api/chapitres");
export const getChapitre = (chapId) => fetchJson(`/api/chapitres/${chapId}`);
export const getLecons = (chapId) => fetchJson(`/api/chapitres/${chapId}/lecons`);
export const getLecon = (code) => fetchJson(`/api/lecons/${code}`);
export const getTexte = (code) => fetchJson(`/api/textes/${code}`);

export const getBinyans = () => fetchJson("/api/binyans");
export const getBinyan = (nom) => fetchJson(`/api/binyans/${encodeURIComponent(nom)}`);

export const getRandomRacine = () => fetchJson("/api/racines/random");
export const getRacine = (shoresh) => fetchJson(`/api/racines/${encodeURIComponent(shoresh)}`);

export const getRandomExpression = () => fetchJson("/api/expressions/random");
export const getExpression = (index) => fetchJson(`/api/expressions/${index}`);

export const getRandomPresse = () => fetchJson("/api/presse/random");
export const getPresse = (index) => fetchJson(`/api/presse/${index}`);

export const getChansons = () => fetchJson("/api/chansons");
export const getRandomChanson = () => fetchJson("/api/chansons/random");
export const getChanson = (position) => fetchJson(`/api/chansons/${position}`);
