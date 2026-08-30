import { Link } from "react-router-dom";
import "../screens.css";

export default function BibleChoiceScreen() {
  return (
    <section className="screen">
      <h1>Bible</h1>
      <div className="tile-list">
        <Link to="/fun/bible/proverbes" className="card-link">
          <div className="card">Proverbes</div>
        </Link>
        <Link to="/fun/bible/tanakh" className="card-link">
          <div className="card">Citations du Tanakh</div>
        </Link>
        <Link to="/fun/bible/recits" className="card-link">
          <div className="card">Récits bibliques</div>
        </Link>
      </div>
    </section>
  );
}
