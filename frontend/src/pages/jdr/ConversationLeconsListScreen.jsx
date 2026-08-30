import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getLecons } from "../../api/content";
import { getJdrChapitre } from "../../api/jdr";
import { getNiveau } from "../../api/user";
import { useConfig } from "../../config/ConfigContext";
import { displayLessonNumber } from "../../utils/lessonDisplay";
import { ChapitreLabelWithLogo } from "../../components/ChapitreLogo";
import "../screens.css";

// Même filtrage déblocage que LeconsListScreen (apprentissage) : une
// conversation n'a de sens que pour une leçon déjà atteinte (son
// vocabulaire cumulatif dépend de la progression), donc les leçons futures
// restent verrouillées ici aussi. Chaque leçon débloquée mène directement
// à JdrScreen plutôt qu'à sa fiche de leçon.
export default function ConversationLeconsListScreen() {
  const { chapId } = useParams();
  const [lecons, setLecons] = useState([]);
  const [jdrByCode, setJdrByCode] = useState({});
  const [niveau, setNiveau] = useState(null);
  const { godMode } = useConfig();

  useEffect(() => {
    getLecons(chapId).then(setLecons);
    getJdrChapitre(chapId).then(setJdrByCode);
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
          const jdrInfo = jdrByCode[lecon.code];
          return unlocked ? (
            <Link key={lecon.code} to={`/jdr/${lecon.code}`} className="card-link">
              <div className="card" style={{ textAlign: "start" }}>
                <div style={{ fontWeight: 600 }}>{lessonLabel}</div>
                {jdrInfo && (
                  <div className="card-details" style={{ marginTop: 6 }}>
                    <span>
                      <strong>Rôle :</strong> <em>{jdrInfo.role_etudiant}</em>
                    </span>
                    <span>
                      <strong>Mission :</strong>{" "}
                      <em style={{ color: "var(--textMuted)" }}>{jdrInfo.objectif_etudiant}</em>
                    </span>
                  </div>
                )}
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
