import SignInScreen from "../onboarding/SignInScreen";

// Écran de développement : affiche l'écran de connexion / création de compte
// (SignInScreen, qui bascule lui-même vers RegisterScreen via son propre
// lien "Enregistrez-vous") — c'est la toute première page vue par le user
// avant identification. `onSignedIn` ne fait rien de plus ici (pas de
// navigation) : contrairement aux autres aperçus, ce n'est PAS un rendu avec
// données fictives — c'est le vrai composant, avec ses vrais appels
// loginAccount/setIdentity, puisque le flux de connexion lui-même est ce qui
// est prévisualisé. Note : ce dev-tool n'est reste accessible qu'une fois
// connecté (Layout intercepte toute route tant qu'aucune identité n'est
// stockée) — le rendu apparaît donc entouré du bandeau normal de l'app,
// contrairement au vrai écran de connexion qui s'affiche seul, sans
// bandeau. Accessible uniquement en tapant l'URL (/dev/signin-preview), cf.
// demande explicite du user.
export default function SignInPreviewScreen() {
  return <SignInScreen onSignedIn={() => {}} />;
}
