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
        <Link to="/examen/orale" className="card-link">
          <div className="card">Compréhension orale</div>
        </Link>
      </div>
    </section>
  );
}
