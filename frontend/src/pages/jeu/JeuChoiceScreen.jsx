import { Link } from "react-router-dom";
import "../screens.css";

export default function JeuChoiceScreen() {
  return (
    <section className="screen">
      <h1>Jeu</h1>
      <div className="tile-list">
        <Link to="/jeu/regles" className="card-link">
          <div className="card">Règle du jeu</div>
        </Link>
        <Link to="/jeu/lotterie" className="card-link">
          <div className="card">Acheter un lot</div>
        </Link>
        <Link to="/jeu/cartes" className="card-link">
          <div className="card">Cartes</div>
        </Link>
      </div>
    </section>
  );
}
