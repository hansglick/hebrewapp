import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getLecons } from "../../api/content";
import { getNiveau } from "../../api/user";
import { displayLessonNumber } from "../../utils/lessonDisplay";
import { ChapitreLabelWithLogo } from "../../components/ChapitreLogo";
import "../screens.css";

// Leçons débloquées d'un chapitre déjà atteint (cf. LibraryChapitresScreen)
// — contrairement à LeconsListScreen (apprentissage), aucune leçon
// verrouillée n'est listée ici (pas de cadenas, pas de message de blocage),
// cf. demande explicite du user.
export default function LibraryLeconsScreen() {
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

  const reference = niveau.reference_lesson ?? niveau.level;
  const unlocked = lecons.filter((lecon) => lecon.code <= reference);

  return (
    <section className="screen">
      <h1>
        <ChapitreLabelWithLogo chapId={chapId} />
      </h1>
      <div className="tile-list">
        {unlocked.map((lecon) => {
          const label = `${displayLessonNumber(lecon.code)}${lecon.titre_texte ? ` — ${lecon.titre_texte}` : ""}`;
          return (
            <Link key={lecon.code} to={`/library/${chapId}/${lecon.code}`} className="card-link">
              <div className="card">{label}</div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
