import { NiveauUpScreen } from "../examen/NiveauUpScreen";

// Écran de développement : affiche l'écran de transition "montée de niveau"
// (NiveauUpScreen) montré après la réussite d'un examen classique — écrit ou
// oral, les deux passent par ce même composant (cf. ExamenBilanScreen) — sans
// avoir à réellement réussir un examen pour le voir (3 essais/jour). Wallet
// et Hard Exam status viennent du vrai compte (via WalletContext/API, montés
// globalement par Layout) ; seuls `code`/`finalResult` sont fictifs.
// Accessible uniquement en tapant l'URL (/dev/niveau-up-preview), cf.
// demande explicite du user.
export default function NiveauUpPreviewScreen() {
  return <NiveauUpScreen code="0.07" finalResult={{ points_gagnes: 42 }} />;
}
