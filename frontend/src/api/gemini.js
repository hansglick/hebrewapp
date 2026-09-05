import { apiFetch, apiFetchJson } from "./http";

export async function evaluateTranslation({ lessonCode, position, direction, studentSolution }) {
  return apiFetchJson("/api/gemini/translation", {
    lesson_code: lessonCode,
    position,
    direction,
    student_solution: studentSolution,
  });
}

// Mode "évaluation globale" : regroupe tout un lot de traductions dans une
// seule requête Gemini plutôt qu'une par question (cf. runBatch() des écrans
// d'examen). `items`: [{identifiant, lessonCode, position, direction, studentSolution}].
export async function evaluateTranslationsGrouped(items) {
  return apiFetchJson(
    "/api/gemini/translation/grouped",
    items.map((it) => ({
      identifiant: it.identifiant,
      lesson_code: it.lessonCode,
      position: it.position,
      direction: it.direction,
      student_solution: it.studentSolution,
    }))
  );
}

export async function extractChansonLyrics(youtubeUrl) {
  return apiFetchJson("/api/chansons/extract", { youtube_url: youtubeUrl });
}

export async function evaluateOral({ textCode, questionIndex, audioBlob }) {
  const formData = new FormData();
  formData.append("text_code", textCode);
  formData.append("question_index", questionIndex);
  formData.append("audio", audioBlob, "recording.wav");
  return apiFetch("/api/gemini/oral", { method: "POST", body: formData });
}

// Mode "évaluation globale" : regroupe tout un lot de réponses orales dans
// une seule requête Gemini. `items`: [{identifiant, textCode, questionIndex, audioBlob}].
// Chaque fichier audio porte son identifiant comme nom (sans extension) pour
// que le backend le rattache au bon item de `items` sans champ dynamique.
// `examCode` : nécessaire pour qu'en cas de surcharge Gemini, le backend
// puisse mettre le lot en attente de relance (cf. app.oral_retry) et
// retrouver ensuite la bonne tentative d'examen à laquelle rattacher les
// réponses — cf. demande explicite du user.
export async function evaluateOralsGrouped(items, examCode) {
  const formData = new FormData();
  formData.append(
    "items",
    JSON.stringify(
      items.map((it) => ({ identifiant: it.identifiant, text_code: it.textCode, question_index: it.questionIndex }))
    )
  );
  formData.append("exam_code", examCode);
  items.forEach((it) => formData.append("audios", it.audioBlob, `${it.identifiant}.wav`));
  return apiFetch("/api/gemini/oral/grouped", { method: "POST", body: formData });
}

// Déclenché par le bouton de la notification d'action "retry_oral_grouped"
// (cf. app.oral_retry) — relance en tâche de fond côté serveur, le user
// n'a besoin de rester sur aucun écran particulier, cf. demande explicite
// du user.
export async function retryOralGroupedBatch(batchId) {
  return apiFetch(`/api/gemini/oral/grouped/retry/${batchId}`, { method: "POST" });
}

export async function extractVerbatim({ audioBlob, lang = "he", context }) {
  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.wav");
  formData.append("lang", lang);
  if (context) formData.append("context", context);
  return apiFetch("/api/gemini/verbatim", { method: "POST", body: formData });
}

export async function evaluateReport({ textCode, rapport }) {
  return apiFetchJson("/api/gemini/rapport", { text_code: textCode, rapport });
}

// Mode "évaluation globale" : regroupe tout un lot de rapports dans une
// seule requête Gemini. `items`: [{identifiant, textCode, rapport}].
export async function evaluateReportsGrouped(items) {
  return apiFetchJson(
    "/api/gemini/rapport/grouped",
    items.map((it) => ({ identifiant: it.identifiant, text_code: it.textCode, rapport: it.rapport }))
  );
}
