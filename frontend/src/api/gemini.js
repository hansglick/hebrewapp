const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

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
  if (!res.ok) throw new Error(`/api/gemini/translation -> ${res.status}`);
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
  if (!res.ok) throw new Error(`/api/gemini/oral -> ${res.status}`);
  return res.json();
}
