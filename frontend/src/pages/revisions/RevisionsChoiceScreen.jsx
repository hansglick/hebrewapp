import { Link, useNavigate } from "react-router-dom";
import { useSwipe } from "../../hooks/useSwipe";
import { useConfig } from "../../config/ConfigContext";
import { ActionHints } from "../../components/ActionHints";
import { TileTitle } from "../../components/TileTitle";
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
      {/* .card partage déjà width:100%/max-width:320px avec .tile-list
          (screens.css) — même largeur que les tuiles ci-dessous ; fond/
          bordure rendus invisibles — cf. demande explicite du user. */}
      <div className="card" style={{ background: "transparent", border: "none", textAlign: "center" }}>
        {/* -33% (2em * 0.67 = 1.34em), non gras — cf. demande explicite du
            user. */}
        <h1 style={{ margin: 0, fontSize: "0.938em", fontWeight: 400, fontStyle: "italic" }}>
          Renforce ton hébreu en révisant les items découverts dans la leçon!
        </h1>
      </div>

      <div className="tile-list">
        <Link to="/revisions/mot" className="card-link">
          <div className="card">
            <TileTitle src="/alefletter.png" gap={20}>Mot</TileTitle>
          </div>
        </Link>
        <Link to="/revisions/verbe" className="card-link">
          <div className="card">
            <TileTitle src="/menorah.svg" gap={20}>Verbe</TileTitle>
          </div>
        </Link>
        <Link to="/revisions/quizz" className="card-link">
          <div className="card">
            <TileTitle src="/quizfinal.png" gap={20}>Quizz</TileTitle>
          </div>
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
