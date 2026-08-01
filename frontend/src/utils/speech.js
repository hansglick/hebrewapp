// Prononciation gratuite via l'API de synthèse vocale du navigateur (pas de clé requise).
export function speak(text, lang = "he-IL") {
  if (!text || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  window.speechSynthesis.speak(utterance);
}
