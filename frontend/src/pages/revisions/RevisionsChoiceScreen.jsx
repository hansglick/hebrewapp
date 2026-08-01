import { Link } from "react-router-dom";
import "../screens.css";

export default function RevisionsChoiceScreen() {
  return (
    <section className="screen">
      <h1>Révisions</h1>
      <div className="tile-list">
        <div className="card" style={{ opacity: 0.5 }}>
          Mot (à venir — Phase 4)
        </div>
        <Link to="/revisions/racine" className="card-link">
          <div className="card">Racine</div>
        </Link>
        <div className="card" style={{ opacity: 0.5 }}>
          Verbe (à venir — Phase 4)
        </div>
        <div className="card" style={{ opacity: 0.5 }}>
          Vocabulaire (à venir — Phase 4)
        </div>
      </div>
    </section>
  );
}
