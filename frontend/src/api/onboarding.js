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

export async function skipOnboarding() {
  return apiFetch("/api/onboarding/skip", { method: "POST" });
}

export async function resetAccount() {
  return apiFetch("/api/onboarding/reset", { method: "POST" });
}
