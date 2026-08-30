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

export async function evaluateTranslation({ lessonCode, position, direction, studentSolution }) {
  const res = await fetch(`${API_URL}/api/gemini/translation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lesson_code: lessonCode,
      position,
      direction,
      student_solution: studentSolution,
    }),
  });
  if (!res.ok) await throwWithDetail(res, "/api/gemini/translation");
  return res.json();
}

export async function extractChansonLyrics(youtubeUrl) {
  const res = await fetch(`${API_URL}/api/chansons/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ youtube_url: youtubeUrl }),
  });
  if (!res.ok) await throwWithDetail(res, "/api/chansons/extract");
  return res.json();
}

export async function evaluateOral({ textCode, questionIndex, audioBlob }) {
  const formData = new FormData();
  formData.append("text_code", textCode);
  formData.append("question_index", questionIndex);
  formData.append("audio", audioBlob, "recording.wav");

  const res = await fetch(`${API_URL}/api/gemini/oral`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) await throwWithDetail(res, "/api/gemini/oral");
  return res.json();
}

export async function extractVerbatim({ audioBlob, lang = "he", context }) {
  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.wav");
  formData.append("lang", lang);
  if (context) formData.append("context", context);

  const res = await fetch(`${API_URL}/api/gemini/verbatim`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) await throwWithDetail(res, "/api/gemini/verbatim");
  return res.json();
}

export async function evaluateReport({ textCode, rapport }) {
  const res = await fetch(`${API_URL}/api/gemini/rapport`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text_code: textCode, rapport }),
  });
  if (!res.ok) await throwWithDetail(res, "/api/gemini/rapport");
  return res.json();
}
