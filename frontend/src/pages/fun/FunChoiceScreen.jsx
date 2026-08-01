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
      </div>
    </section>
  );
}
