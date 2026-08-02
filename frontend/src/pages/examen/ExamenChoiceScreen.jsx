import { Link } from "react-router-dom";
import "../screens.css";

export default function ExamenChoiceScreen() {
  return (
    <section className="screen">
      <h1>Examen</h1>
      <div className="tile-list">
        <Link to="/examen/ecrite" className="card-link">
          <div className="card">Compréhension écrite</div>
        </Link>
        <div className="card" style={{ opacity: 0.5 }}>
          Compréhension orale (à venir — Phase 7)
        </div>
      </div>
    </section>
  );
}
