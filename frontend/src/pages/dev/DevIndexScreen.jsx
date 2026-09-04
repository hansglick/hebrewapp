import { Link } from "react-router-dom";
import "../screens.css";

const PREVIEWS = [
  {
    to: "/dev/signin-preview",
    label: "Connexion / création de compte",
    description: "Toute première page vue par le user, avant identification.",
  },
  {
    to: "/dev/onboarding-preview",
    label: "Onboarding",
    description: "Intro, questions écrites/orales, résultats, écran de fin — données fictives.",
  },
  {
    to: "/dev/niveau-up-preview",
    label: "Montée de niveau",
    description: "Transition affichée après la réussite d'un examen (écrit ou oral).",
  },
  {
    to: "/dev/lotterie-preview",
    label: "Achat de lots",
    description: "Boutique de lots avec portefeuille fictif — aucun achat réel.",
  },
  {
    to: "/dev/waiting-preview",
    label: "Attente d'évaluation",
    description: "Écran affiché pendant la correction groupée d'un examen.",
  },
  {
    to: "/dev/quizz-preview",
    label: "Quizz (révisions vs examen)",
    description: "Comparaison côte à côte du rendu d'un objet quizz.",
  },
];

// Point d'entrée unique vers tous les écrans de développement (rendus avec
// des données fictives, sans passer par les vrais flux/API) — regroupés ici
// plutôt que distribués comme une simple liste d'URLs, pour rester
// découvrable au fil des ajouts futurs. Accessible uniquement en tapant
// l'URL (/dev), cf. demande explicite du user.
export default function DevIndexScreen() {
  return (
    <section className="screen">
      <h1>Aperçus (dev)</h1>
      <div className="tile-list">
        {PREVIEWS.map((p) => (
          <Link key={p.to} to={p.to} className="card-link">
            <div className="card">
              <div style={{ fontWeight: 600 }}>{p.label}</div>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.85em" }}>
                {p.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
