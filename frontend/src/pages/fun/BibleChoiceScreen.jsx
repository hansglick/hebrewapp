import { Link } from "react-router-dom";
import "../screens.css";

export default function BibleChoiceScreen() {
  return (
    <section className="screen">
      {/* .card partage déjà width:100%/max-width:320px avec .tile-list
          (screens.css) — même largeur que les tuiles ci-dessous ; fond/
          bordure rendus invisibles — cf. demande explicite du user. */}
      <div className="card" style={{ background: "transparent", border: "none", textAlign: "center" }}>
        {/* -33% (2em * 0.67 = 1.34em), non gras — cf. demande explicite du
            user. */}
        <h1 style={{ margin: 0, fontSize: "0.938em", fontWeight: 400, fontStyle: "italic" }}>
          Lis l'hébreu à la source dans un des livres les plus anciens au monde
        </h1>
      </div>
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
