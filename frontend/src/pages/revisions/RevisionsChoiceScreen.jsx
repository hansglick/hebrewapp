import { Link } from "react-router-dom";
import "../screens.css";

export default function RevisionsChoiceScreen() {
  return (
    <section className="screen">
      <h1>Révisions</h1>
      <div className="tile-list">
        <Link to="/revisions/mot" className="card-link">
          <div className="card">Mot</div>
        </Link>
        <Link to="/revisions/verbe" className="card-link">
          <div className="card">Verbe</div>
        </Link>
        <div className="card" style={{ opacity: 0.5 }}>
          Compréhension écrite (stratégie de tirage à définir)
        </div>
        <div className="card" style={{ opacity: 0.5 }}>
          Compréhension orale (stratégie de tirage à définir — Phase 7)
        </div>
      </div>
    </section>
  );
}
