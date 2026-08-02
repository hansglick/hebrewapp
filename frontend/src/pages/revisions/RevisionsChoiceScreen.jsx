import { Link, useNavigate } from "react-router-dom";
import { useSwipe } from "../../hooks/useSwipe";
import "../screens.css";

export default function RevisionsChoiceScreen() {
  const navigate = useNavigate();

  // Permet de revenir en avant (flèche droite) vers l'écran quitté via un
  // retour arrière (ex: flèche gauche depuis Mot avec historique vide).
  const swipeHandlers = useSwipe({
    onSwipeRight: () => navigate(1),
  });

  return (
    <section className="screen" {...swipeHandlers}>
      <h1>Révisions</h1>
      <div className="tile-list">
        <Link to="/revisions/mot" className="card-link">
          <div className="card">Mot</div>
        </Link>
        <Link to="/revisions/verbe" className="card-link">
          <div className="card">Verbe</div>
        </Link>
        <Link to="/revisions/question-ecrite" className="card-link">
          <div className="card">Compréhension écrite</div>
        </Link>
        <Link to="/revisions/question-orale" className="card-link">
          <div className="card">Compréhension orale</div>
        </Link>
      </div>
    </section>
  );
}
