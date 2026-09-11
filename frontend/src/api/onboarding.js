import { apiFetch, apiFetchJson } from "./http";

export async function getOnboardingStatus() {
  return apiFetch("/api/onboarding/status");
}

export async function startOnboardingExam() {
  return apiFetch("/api/onboarding/exam/start", { method: "POST" });
}

export async function getCurrentOnboardingExam() {
  return apiFetch("/api/onboarding/exam/current");
}

export async function advanceOnboardingExam({ questionNumber, kind, result }) {
  return apiFetchJson("/api/onboarding/exam/advance", { question_number: questionNumber, kind, result });
}

export async function abandonOnboardingExam() {
  return apiFetch("/api/onboarding/exam/abandon", { method: "POST" });
}

// Quick Test — algorithme adaptatif par bissection (cf.
// backend/app/quicktest_exam.py), bouton additionnel proposé à côté de
// l'examen d'entrée classique ci-dessus (endpoints entièrement séparés) —
// cf. demande explicite du user.
export async function startQuicktestExam() {
  return apiFetch("/api/onboarding/quicktest/start", { method: "POST" });
}

export async function getCurrentQuicktestExam() {
  return apiFetch("/api/onboarding/quicktest/current");
}

export async function advanceQuicktestExam({ questionNumber, kind, result }) {
  return apiFetchJson("/api/onboarding/quicktest/advance", { question_number: questionNumber, kind, result });
}

export async function abandonQuicktestExam() {
  return apiFetch("/api/onboarding/quicktest/abandon", { method: "POST" });
}

export async function skipOnboarding() {
  return apiFetch("/api/onboarding/skip", { method: "POST" });
}

export async function resetAccount() {
  return apiFetch("/api/onboarding/reset", { method: "POST" });
}
