import AuthFlow from "../onboarding/AuthFlow";

// Écran de développement : affiche le funnel complet "premier lancement"
// (AuthFlow — choix "As-tu déjà un compte ?" puis connexion ou
// inscription) — c'est la toute première page vue par le user avant
// identification. `onSignedIn`/`onRegistered` ne font rien de plus ici
// (pas de navigation) : contrairement aux autres aperçus, ce n'est PAS un
// rendu avec données fictives — c'est le vrai composant, avec ses vrais
// appels loginAccount/registerAccount/setIdentity, puisque le flux
// lui-même est ce qui est prévisualisé. Note : ce dev-tool reste
// accessible qu'une fois connecté (Layout intercepte toute route tant
// qu'aucune identité n'est stockée) — le rendu apparaît donc entouré du
// bandeau normal de l'app, contrairement au vrai funnel qui s'affiche
// seul, sans bandeau. Accessible uniquement en tapant l'URL
// (/dev/signin-preview), cf. demande explicite du user.
export default function SignInPreviewScreen() {
  return <AuthFlow onSignedIn={() => {}} onRegistered={() => {}} />;
}
