import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getLecons } from "../../api/content";
import { getNiveau } from "../../api/user";
import { useConfig } from "../../config/ConfigContext";
import { displayLessonNumber } from "../../utils/lessonDisplay";
import { ChapitreLabelWithLogo } from "../../components/ChapitreLogo";
import "../screens.css";

// Même filtrage déblocage que ConversationLeconsListScreen (jdr) : une
// conversation "Révise avec ton professeur" n'a de sens que pour une leçon
// déjà atteinte. Pas de role/mission à afficher ici (spécifique au jeu de
// rôle) — juste la liste des leçons débloquées, chacune menant directement
// à RevisionScreen.
export default function ConversationProfLeconsListScreen() {
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
          🔒 Une conversation ne devient disponible qu'une fois la leçon correspondante atteinte.
        </p>
      )}
      <div className="tile-list">
        {lecons.map((lecon) => {
          const unlocked = godMode || !niveau || lecon.code <= reference;
          const lessonLabel = displayLessonNumber(lecon.code);
          return unlocked ? (
            <Link key={lecon.code} to={`/revision-prof/${lecon.code}`} className="card-link">
              <div className="card" style={{ textAlign: "start" }}>
                <div style={{ fontWeight: 600 }}>{lessonLabel}</div>
              </div>
            </Link>
          ) : (
            <div key={lecon.code} className="card" style={{ opacity: 0.5 }}>
              🔒 {lessonLabel}
            </div>
          );
        })}
      </div>
    </section>
  );
}
