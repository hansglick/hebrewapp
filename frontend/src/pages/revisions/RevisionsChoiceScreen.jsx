import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getExamReadiness } from "../../api/user";
import { useSwipe } from "../../hooks/useSwipe";
import { ActionHints } from "../../components/ActionHints";
import { ProgressBar } from "../../components/ProgressBar";
import { readinessDisplay } from "../../utils/readinessMessage";
import "../screens.css";

export default function RevisionsChoiceScreen() {
  const navigate = useNavigate();
  const [readiness, setReadiness] = useState(null);

  useEffect(() => {
    getExamReadiness().then(setReadiness);
  }, []);

  // Permet de revenir en avant (flèche droite) vers l'écran quitté via un
  // retour arrière (ex: flèche gauche depuis Mot avec historique vide).
  const swipeHandlers = useSwipe({
    onSwipeRight: () => navigate(1),
  });

  const readinessInfo = readinessDisplay(readiness);

  return (
    <section className="screen" onPointerDown={swipeHandlers.onPointerDown}>
      <ActionHints {...swipeHandlers.hints} />
      <h1>Révisions</h1>

      {readinessInfo && (
        <div
          style={{
            width: "100%",
            maxWidth: 320,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            alignItems: "center",
          }}
        >
          <span style={{ fontWeight: 600, fontSize: "0.9em" }}>{Math.ceil(readinessInfo.percent)}%</span>
          <ProgressBar value={readinessInfo.percent} color={readinessInfo.color} />
          <p className="muted" style={{ margin: 0, textAlign: "center" }}>
            {readinessInfo.message}
          </p>
        </div>
      )}

      <div className="tile-list">
        <Link to="/revisions/mot" className="card-link">
          <div className="card">Mot</div>
        </Link>
        <Link to="/revisions/verbe" className="card-link">
          <div className="card">Verbe</div>
        </Link>
        <Link to="/revisions/question-ecrite" className="card-link">
          <div className="card">Traductions</div>
        </Link>
        <Link to="/revisions/quizz" className="card-link">
          <div className="card">Quizz Vocabulaire</div>
        </Link>
        <Link to="/revisions/question-orale" className="card-link">
          <div className="card">Oral</div>
        </Link>
        <Link to="/revisions/statistiques" className="card-link">
          <div className="card">Tes erreurs</div>
        </Link>
      </div>
    </section>
  );
}
