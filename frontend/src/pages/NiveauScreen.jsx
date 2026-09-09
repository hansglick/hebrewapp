import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getNiveau } from "../api/user";
import { displayLessonNumber } from "../utils/lessonDisplay";
import { displayChapitreLabel } from "../utils/chapitreDisplay";
import "./screens.css";

export default function NiveauScreen() {
  const [niveau, setNiveau] = useState(null);

  useEffect(() => {
    getNiveau().then(setNiveau);
  }, []);

  if (!niveau) return null;

  const chapId = niveau.level.split(".")[0];
  const label = `Niveau ${displayChapitreLabel(chapId)}.${displayLessonNumber(niveau.level)}`;

  return (
    <section className="screen">
      <h1>{label}</h1>
      <p className="muted">
        Vous avez atteint le niveau "{label}" depuis {niveau.jours_bloque} jour(s).
      </p>
      <Link to="/niveau/sauter" className="card-link">
        <div className="card">Sauter des leçons</div>
      </Link>
    </section>
  );
}
