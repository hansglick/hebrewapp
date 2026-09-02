const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// URL du proxy backend (endpoint non officiel translate.google.com/translate_tts) —
// un vrai fichier audio avec durée, pas du Web Speech API, donc utilisable
// tel quel dans un <audio> classique (cf. AudioProgressBlock).
export function ttsUrl(text, lang = "he") {
  return `${API_URL}/api/tts?text=${encodeURIComponent(text)}&lang=${lang}`;
}

export function speak(text, lang = "he") {
  if (!text) return;
  new Audio(ttsUrl(text, lang)).play();
}
