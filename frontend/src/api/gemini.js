import { apiFetch, apiFetchJson } from "./http";

export async function evaluateTranslation({ lessonCode, position, direction, studentSolution }) {
  return apiFetchJson("/api/gemini/translation", {
    lesson_code: lessonCode,
    position,
    direction,
    student_solution: studentSolution,
  });
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
