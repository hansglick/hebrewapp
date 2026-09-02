import { apiFetch } from "./http";

const fetchJson = (path) => apiFetch(path);

export const getChapitres = () => fetchJson("/api/chapitres");
export const getChapitre = (chapId) => fetchJson(`/api/chapitres/${chapId}`);
export const getLecons = (chapId) => fetchJson(`/api/chapitres/${chapId}/lecons`);
export const getLecon = (code) => fetchJson(`/api/lecons/${code}`);
export const getLeconExploration = (code) => fetchJson(`/api/lecons/${code}/exploration`);
export const getTexte = (code) => fetchJson(`/api/textes/${code}`);

export const getBinyans = () => fetchJson("/api/binyans");
export const getBinyan = (nom) => fetchJson(`/api/binyans/${encodeURIComponent(nom)}`);

export const getRandomRacine = () => fetchJson("/api/racines/random");
export const getRacine = (shoresh) => fetchJson(`/api/racines/${encodeURIComponent(shoresh)}`);

export const getChansons = () => fetchJson("/api/chansons");
export const getRandomChanson = () => fetchJson("/api/chansons/random");
export const getChanson = (position) => fetchJson(`/api/chansons/${position}`);

function withCurrent(path, current) {
  return current !== undefined && current !== null
    ? `${path}&current=${encodeURIComponent(current)}`
    : path;
}

export const getRandomMot = (lessonCode, mode = "exploration", current) =>
  fetchJson(
    withCurrent(`/api/mots/random?lesson_code=${encodeURIComponent(lessonCode)}&mode=${mode}`, current)
  );

export const getRandomVerbe = (lessonCode, mode = "exploration", current) =>
  fetchJson(
    withCurrent(`/api/verbes/random?lesson_code=${encodeURIComponent(lessonCode)}&mode=${mode}`, current)
  );

export const getRandomPhrase = (lessonCode, mode = "exploration", current, direction) => {
  let url = `/api/phrases/random?lesson_code=${encodeURIComponent(lessonCode)}&mode=${mode}`;
  if (direction) url += `&direction=${encodeURIComponent(direction)}`;
  return fetchJson(withCurrent(url, current));
};

export const getRandomQuizz = (lessonCode) =>
  fetchJson(`/api/quizz/random?lesson_code=${encodeURIComponent(lessonCode)}`);

export const getStats = (tab) => fetchJson(`/api/stats/${encodeURIComponent(tab)}`);
export const getRecencyStats = () => fetchJson("/api/stats/recence");

// Sans effet de bord (contrairement à getNotifications, qui marque tout
// comme lu) — safe à appeler en polling pour le badge du header.
export const getUnreadNotificationCount = () => fetchJson("/api/notifications/unread-count");

export const getExamen = (code, godMode = false) =>
  fetchJson(`/api/examens/${encodeURIComponent(code)}${godMode ? "?god_mode=true" : ""}`);
export const getExamenOral = (code, godMode = false) =>
  fetchJson(`/api/examens/${encodeURIComponent(code)}/oral${godMode ? "?god_mode=true" : ""}`);
export const getExamenHardStatus = () => fetchJson("/api/examens/hard/status");
export const getExamenHard = () => fetchJson("/api/examens/hard");
export const getExamenHardCopie = (id) => fetchJson(`/api/examens/hard/copies/${encodeURIComponent(id)}`);
export const getExamensSummary = () => fetchJson("/api/examens/summary");
export const getExamenProgression = () => fetchJson("/api/examens/progression");
export const getExamenCopies = () => fetchJson("/api/examens/copies");
export const getExamenCopie = (id) => fetchJson(`/api/examens/copies/${encodeURIComponent(id)}`);

export const getWaitingVids = () => fetchJson("/api/waiting-vids");

export const getRandomQuestionOrale = (lessonCode, mode = "exploration", current) =>
  fetchJson(
    withCurrent(
      `/api/questions-orales/random?lesson_code=${encodeURIComponent(lessonCode)}&mode=${mode}`,
      current
    )
  );

export const searchDictionnaire = (query, mode) =>
  fetchJson(`/api/dictionnaire?query=${encodeURIComponent(query)}&mode=${mode}`);

export const getVerbe = (key) => fetchJson(`/api/verbes/${encodeURIComponent(key)}`);

export const getRandomCuriosite = (type, { lessonCode, current } = {}) => {
  const params = new URLSearchParams();
  if (lessonCode) params.set("lesson_code", lessonCode);
  if (current !== undefined && current !== null) params.set("current", current);
  const qs = params.toString();
  return fetchJson(`/api/curiosites/${encodeURIComponent(type)}/random${qs ? `?${qs}` : ""}`);
};

export const getLessonCuriosites = (code) =>
  fetchJson(`/api/curiosites/lesson/${encodeURIComponent(code)}`);

// Liste ordonnée (plus récemment débloqué en premier) des items débloqués à
// la progression courante — parcours simple sans randomisation ni bouclage
// (cf. écrans "Fun"/Culture, CuriositeScreen sans lessonCode).
export const getCuriositePool = (type) =>
  fetchJson(`/api/curiosites/${encodeURIComponent(type)}/pool`);

export const getCuriositeItem = (type, index) =>
  fetchJson(`/api/curiosites/${encodeURIComponent(type)}/${encodeURIComponent(index)}`);

// Item vraiment aléatoire, tous types confondus, sans respecter le
// déblocage progressif — sert à distraire le user pendant l'attente d'une
// correction Gemini sur un examen long/très long (cf. GeminiWaiting).
export const getRandomAnyCuriosite = () => fetchJson("/api/curiosites/random-any");
