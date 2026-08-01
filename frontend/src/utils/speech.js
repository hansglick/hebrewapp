const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// Prononciation via le proxy backend (endpoint non officiel translate.google.com/translate_tts).
export function speak(text, lang = "he") {
  if (!text) return;
  const url = `${API_URL}/api/tts?text=${encodeURIComponent(text)}&lang=${lang}`;
  new Audio(url).play();
}
