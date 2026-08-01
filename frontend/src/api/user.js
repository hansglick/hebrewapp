const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export async function getNiveau() {
  const res = await fetch(`${API_URL}/api/niveau`);
  if (!res.ok) throw new Error(`/api/niveau -> ${res.status}`);
  return res.json();
}

export async function updateNiveau(level) {
  const res = await fetch(`${API_URL}/api/niveau`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level }),
  });
  if (!res.ok) throw new Error(`/api/niveau -> ${res.status}`);
  return res.json();
}

export async function createEvaluation({ objectType, objectKey, success, score }) {
  const res = await fetch(`${API_URL}/api/evaluations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      object_type: objectType,
      object_key: objectKey,
      success,
      score,
    }),
  });
  if (!res.ok) throw new Error(`/api/evaluations -> ${res.status}`);
  return res.json();
}

export async function getEvaluations({ objectType, objectKey, limit = 5 }) {
  const params = new URLSearchParams({
    object_type: objectType,
    object_key: objectKey,
    limit,
  });
  const res = await fetch(`${API_URL}/api/evaluations?${params}`);
  if (!res.ok) throw new Error(`/api/evaluations -> ${res.status}`);
  return res.json();
}
