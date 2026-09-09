import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getLecons } from "../api/content";
import { getNiveau } from "../api/user";
import { displayLessonNumber } from "../utils/lessonDisplay";
import { ChapitreLabelWithLogo } from "../components/ChapitreLogo";
import "./screens.css";

// Leçons d'un chapitre, tuile = numéro de leçon uniquement, menant
// directement à la page d'accueil de l'examen correspondant
// (ExamenCibleScreen) — les leçons antérieures au niveau ACTUEL du user
// (niveau.level, pas reference_lesson) ne sont pas affichées, cf. demande
// explicite du user.
export default function SauterLeconsScreen() {
  const { chapId } = useParams();
  const [lecons, setLecons] = useState([]);
  const [niveau, setNiveau] = useState(null);

  useEffect(() => {
    getLecons(chapId).then(setLecons);
  }, [chapId]);

  useEffect(() => {
    getNiveau().then(setNiveau);
  }, []);

  if (!niveau) return null;

  const upcoming = lecons.filter((lecon) => lecon.code >= niveau.level);

  return (
    <section className="screen">
      <h1>
        <ChapitreLabelWithLogo chapId={chapId} />
      </h1>
      <div className="tile-list">
        {upcoming.map((lecon) => (
          <Link key={lecon.code} to={`/examen/cible/${lecon.code}`} className="card-link">
            <div className="card">{displayLessonNumber(lecon.code)}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
