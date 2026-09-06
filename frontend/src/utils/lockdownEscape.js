// Activé quand le user choisit "Recevoir les résultats par courrier" (cf.
// WaitingVideo) pendant l'évaluation groupée d'un examen long/très
// long/hard : la correction continue en arrière-plan côté client (le
// batch déjà lancé n'est pas interrompu par le démontage de l'écran), mais
// sans ce drapeau, Layout.jsx force sinon systématiquement la navigation à
// revenir sur l'examen tant que la session existe côté serveur (cf.
// getActiveLockdown) — rendant impossible la promesse du bouton
// ("explore l'application pendant l'attente"), cf. bug rapporté par le
// user.
const KEY = "lockdown-mail-escape";

export function activateLockdownEscape() {
  sessionStorage.setItem(KEY, "true");
}

export function isLockdownEscapeActive() {
  return sessionStorage.getItem(KEY) === "true";
}

export function clearLockdownEscape() {
  sessionStorage.removeItem(KEY);
}
