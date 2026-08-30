// Un pseudo n'a besoin de rien de plus que le bloc hébreu Unicode (lettres +
// niqqud + cantillation) et des espaces — même filtre que le backend
// (app.auth.sanitize_pseudo), appliqué ici en plus au clavier pour un retour
// immédiat. Partagé par SignInScreen/RegisterScreen/OnboardingScreen.
const NON_HEBREW_RE = /[^֐-׿\s]/g;
export const PSEUDO_MAX_LENGTH = 10;

export function sanitizePseudo(value) {
  return value.replace(NON_HEBREW_RE, "").slice(0, PSEUDO_MAX_LENGTH);
}
