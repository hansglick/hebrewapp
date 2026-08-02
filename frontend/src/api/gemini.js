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

export async function evaluateOral({ textCode, questionIndex, audioBlob }) {
  const formData = new FormData();
  formData.append("text_code", textCode);
  formData.append("question_index", questionIndex);
  formData.append("audio", audioBlob, "recording.webm");

  const res = await fetch(`${API_URL}/api/gemini/oral`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) await throwWithDetail(res, "/api/gemini/oral");
  return res.json();
}
