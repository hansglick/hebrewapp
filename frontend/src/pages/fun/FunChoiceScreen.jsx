import { Link } from "react-router-dom";
import "../screens.css";

export default function FunChoiceScreen() {
  return (
    <section className="screen">
      <h1>Fun !</h1>
      <div className="tile-list">
        <Link to="/fun/expressions" className="card-link">
          <div className="card">Expressions</div>
        </Link>
        <Link to="/fun/presse" className="card-link">
          <div className="card">Presse</div>
        </Link>
        <Link to="/fun/chansons" className="card-link">
          <div className="card">Chansons</div>
        </Link>
        <Link to="/fun/bible" className="card-link">
          <div className="card">Bible</div>
        </Link>
        <Link to="/fun/blagues" className="card-link">
          <div className="card">Blagues</div>
        </Link>
        <Link to="/fun/israel" className="card-link">
          <div className="card">Visitez Israël</div>
        </Link>
        <Link to="/fun/mots-origine-hebraique" className="card-link">
          <div className="card">Mot d'origine hébraïque</div>
        </Link>
      </div>
    </section>
  );
}
