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

export async function getOnboardingStatus() {
  const res = await fetch(`${API_URL}/api/onboarding/status`);
  if (!res.ok) await throwWithDetail(res, "/api/onboarding/status");
  return res.json();
}

export async function startOnboardingExam(pseudo) {
  const res = await fetch(`${API_URL}/api/onboarding/exam/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pseudo }),
  });
  if (!res.ok) await throwWithDetail(res, "/api/onboarding/exam/start");
  return res.json();
}

export async function getCurrentOnboardingExam() {
  const res = await fetch(`${API_URL}/api/onboarding/exam/current`);
  if (!res.ok) await throwWithDetail(res, "/api/onboarding/exam/current");
  return res.json();
}

export async function advanceOnboardingExam({ questionNumber, kind, result }) {
  const res = await fetch(`${API_URL}/api/onboarding/exam/advance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question_number: questionNumber, kind, result }),
  });
  if (!res.ok) await throwWithDetail(res, "/api/onboarding/exam/advance");
  return res.json();
}

export async function resetAccount() {
  const res = await fetch(`${API_URL}/api/onboarding/reset`, { method: "POST" });
  if (!res.ok) await throwWithDetail(res, "/api/onboarding/reset");
  return res.json();
}
