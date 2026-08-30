import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getNiveau } from "../api/user";
import { displayLessonCode } from "../utils/lessonDisplay";
import "./screens.css";

export default function NiveauScreen() {
  const [niveau, setNiveau] = useState(null);

  useEffect(() => {
    getNiveau().then(setNiveau);
  }, []);

  if (!niveau) return null;

  return (
    <section className="screen">
      <h1>Niveau {displayLessonCode(niveau.level)}</h1>
      <p className="muted">
        Bloqué à ce niveau depuis {niveau.jours_bloque} jour(s)
      </p>
      {niveau.next_lesson_code ? (
        <Link to={`/examen/cible/${niveau.next_lesson_code}`} className="card-link">
          <div className="card">Passer le prochain examen ({displayLessonCode(niveau.next_lesson_code)})</div>
        </Link>
      ) : (
        <div className="card" style={{ opacity: 0.5 }}>
          Dernier niveau du cours atteint
        </div>
      )}
    </section>
  );
}
