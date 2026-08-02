import { Link, useParams } from "react-router-dom";
import "../screens.css";

export default function EvaluationChoiceScreen() {
  const { chapId, code } = useParams();

  return (
    <section className="screen">
      <h1>Évaluation — Leçon {code}</h1>
      <div className="tile-list">
        <Link
          to={`/apprentissage/${chapId}/${code}/questions-ecrites`}
          className="card-link"
        >
          <div className="card">Questions écrites</div>
        </Link>
        <Link
          to={`/apprentissage/${chapId}/${code}/questions-orales`}
          className="card-link"
        >
          <div className="card">Questions orales</div>
        </Link>
      </div>
    </section>
  );
}
