import { Link } from "react-router-dom";
import "../screens.css";

export default function ChansonChoiceScreen() {
  return (
    <section className="screen">
      <h1>Chansons</h1>
      <div className="tile-list">
        <Link to="/fun/chansons/exploration" className="card-link">
          <div className="card">Exploration</div>
        </Link>
        <Link to="/fun/chansons/recherche" className="card-link">
          <div className="card">Rechercher des paroles</div>
        </Link>
      </div>
    </section>
  );
}
