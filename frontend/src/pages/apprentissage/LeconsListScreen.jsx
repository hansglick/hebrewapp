import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getLecons } from "../../api/content";
import { getNiveau } from "../../api/user";
import { useConfig } from "../../config/ConfigContext";
import { displayLessonNumber } from "../../utils/lessonDisplay";
import { ChapitreLabelWithLogo } from "../../components/ChapitreLogo";
import "../screens.css";

export default function LeconsListScreen() {
  const { chapId } = useParams();
  const [lecons, setLecons] = useState([]);
  const [niveau, setNiveau] = useState(null);
  const { godMode } = useConfig();

  useEffect(() => {
    getLecons(chapId).then(setLecons);
  }, [chapId]);

  useEffect(() => {
    getNiveau().then(setNiveau);
  }, []);

  const reference = niveau?.reference_lesson ?? niveau?.level;
  const hasLocked = !godMode && niveau && lecons.some((lecon) => lecon.code > reference);

  return (
    <section className="screen">
      <h1>
        <ChapitreLabelWithLogo chapId={chapId} />
      </h1>
      {hasLocked && (
        <p className="muted">
          🔒 Pour débloquer une leçon : apprends-la, révise-la, puis réussis les
          examens écrit et oral portant sur les leçons précédentes.
        </p>
      )}
      <div className="tile-list">
        {lecons.map((lecon) => {
          const unlocked = godMode || !niveau || lecon.code <= reference;
          const label = `${displayLessonNumber(lecon.code)}${lecon.titre_texte ? ` — ${lecon.titre_texte}` : ""}`;
          return unlocked ? (
            <Link
              key={lecon.code}
              to={`/apprentissage/${chapId}/${lecon.code}`}
              className="card-link"
            >
              <div className="card">{label}</div>
            </Link>
          ) : (
            <div key={lecon.code} className="card" style={{ opacity: 0.5 }}>
              🔒 {label}
            </div>
          );
        })}
      </div>
    </section>
  );
}
