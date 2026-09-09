import { Link, useNavigate } from "react-router-dom";
import { useSwipe } from "../../hooks/useSwipe";
import { useConfig } from "../../config/ConfigContext";
import { ActionHints } from "../../components/ActionHints";
import "../screens.css";

export default function RevisionsChoiceScreen() {
  const navigate = useNavigate();
  const { godMode } = useConfig();

  // Permet de revenir en avant (flèche droite) vers l'écran quitté via un
  // retour arrière (ex: flèche gauche depuis Mot avec historique vide).
  const swipeHandlers = useSwipe({
    onSwipeRight: () => navigate(1),
  });

  return (
    <section className="screen" onPointerDown={swipeHandlers.onPointerDown}>
      <ActionHints {...swipeHandlers.hints} />
      <h1>Révisions</h1>

      <div className="tile-list">
        <Link to="/revisions/mot" className="card-link">
          <div className="card">Mot</div>
        </Link>
        <Link to="/revisions/verbe" className="card-link">
          <div className="card">Verbe</div>
        </Link>
        <Link to="/revisions/quizz" className="card-link">
          <div className="card">Quizz Vocabulaire</div>
        </Link>
        {/* Réservée au God Mode (cf. useConfig, toggle "God Mode" du
            bouton configuration) — cf. demande explicite du user. */}
        {godMode && (
          <Link to="/revisions/statistiques" className="card-link">
            <div className="card">Tes erreurs</div>
          </Link>
        )}
      </div>
    </section>
  );
}
