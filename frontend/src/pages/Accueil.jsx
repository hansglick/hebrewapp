import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getNiveau, getExamReadiness } from "../api/user";
import { getLeconExploration, getExamenHardStatus } from "../api/content";
import { getOnboardingStatus, resetAccount } from "../api/onboarding";
import { ChapitreLogo } from "../components/ChapitreLogo";
import { ProgressBar } from "../components/ProgressBar";
import { ShekelIcon } from "../components/ShekelIcon";
import { displayChapitreLabel } from "../utils/chapitreDisplay";
import { displayLessonNumber } from "../utils/lessonDisplay";
import { leconProgressMessage } from "../utils/leconProgressMessage";
import { readinessDisplay } from "../utils/readinessMessage";
import "./screens.css";

export default function Accueil() {
  const [niveau, setNiveau] = useState(null);
  const [exploration, setExploration] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [hardStatus, setHardStatus] = useState(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [pseudo, setPseudo] = useState(null);

  useEffect(() => {
    getNiveau().then(setNiveau);
    getExamReadiness().then(setReadiness);
    getExamenHardStatus().then(setHardStatus);
    getOnboardingStatus().then((s) => setPseudo(s.pseudo));
  }, []);

  useEffect(() => {
    if (niveau?.reference_lesson) getLeconExploration(niveau.reference_lesson).then(setExploration);
  }, [niveau]);

  async function handleReset() {
    await resetAccount();
    // Layout revérifie /api/onboarding/status au prochain changement de
    // route — un rechargement complet est le moyen le plus simple de
    // repartir de zéro sans avoir à réconcilier tout l'état local (wallet,
    // niveau...) éparpillé dans plusieurs contextes.
    window.location.assign("/");
  }

  if (!niveau) return null;

  const referenceLesson = niveau.reference_lesson;
  const chapId = referenceLesson ? referenceLesson.split(".")[0] : null;
  const explorationPercent =
    exploration && exploration.total > 0 ? (100 * exploration.seen) / exploration.total : 0;
  const leconProgress = leconProgressMessage(explorationPercent);
  const readinessInfo = readinessDisplay(readiness);

  return (
    <section className="screen">
      {pseudo && (
        <h1 className="hebrew" style={{ margin: "0 0 8px", direction: "rtl" }}>
          שלום {pseudo}
        </h1>
      )}
      <div className="tile-list" style={{ gap: 8 }}>
        {referenceLesson && (
          <Link to={`/apprentissage/${chapId}/${referenceLesson}`} className="card-link">
            <div className="card" style={{ textAlign: "center" }}>
              <ChapitreLogo chapId={chapId} size="3.4em" style={{ marginInlineStart: 0 }} />
              <div style={{ fontWeight: 600, margin: "6px 0 10px" }}>
                {displayChapitreLabel(chapId)} — {displayLessonNumber(referenceLesson)}
              </div>
              {exploration && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
                  <span style={{ fontWeight: 600, fontSize: "0.9em" }}>{Math.ceil(explorationPercent)}%</span>
                  <ProgressBar value={explorationPercent} color={leconProgress.color} />
                  <p className="muted" style={{ margin: 0 }}>
                    Leçon en cours
                  </p>
                </div>
              )}
            </div>
          </Link>
        )}
        <Link
          to="/apprentissage"
          className="link-btn"
          style={{ textAlign: "center", border: "none", background: "none", padding: 0 }}
        >
          Consulter les leçons précédentes
        </Link>

        {referenceLesson && (
          <Link to={`/jdr/${referenceLesson}`} className="card-link">
            <div className="card" style={{ textAlign: "center", fontWeight: 600, fontSize: "1.1em" }}>
              Conversation
            </div>
          </Link>
        )}
        <Link
          to="/jdr"
          className="link-btn"
          style={{ textAlign: "center", border: "none", background: "none", padding: 0 }}
        >
          Rejouer les conversations précédentes
        </Link>

        <Link to="/revisions" className="card-link">
          <div className="card" style={{ textAlign: "center" }}>
            <div style={{ fontWeight: 600, margin: "0 0 10px", fontSize: "1.1em" }}>Réviser</div>
            {readinessInfo && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
                <span style={{ fontWeight: 600, fontSize: "0.9em" }}>{Math.ceil(readinessInfo.percent)}%</span>
                <ProgressBar value={readinessInfo.percent} color={readinessInfo.color} />
                <p className="muted" style={{ margin: 0 }}>
                  Révise avant l'examen!
                </p>
              </div>
            )}
          </div>
        </Link>

        {niveau.next_lesson_code ? (
          <Link to={`/examen/cible/${niveau.next_lesson_code}`} className="card-link">
            <div className="card" style={{ textAlign: "center", fontWeight: 600, fontSize: "1.1em" }}>
              Passez l'examen !
            </div>
          </Link>
        ) : (
          <div className="card" style={{ textAlign: "center", opacity: 0.5 }}>
            Dernier niveau du cours atteint
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
          <Link
            to="/examen/copies"
            className="link-btn"
            style={{ border: "none", background: "none", padding: 0 }}
          >
            Consulter mes copies
          </Link>
          <Link
            to="/examen/sauter"
            className="link-btn"
            style={{ border: "none", background: "none", padding: 0 }}
          >
            Demander une équivalence
          </Link>
        </div>
        {hardStatus?.unlocked && (
          <Link to="/examen/hard" className="card-link">
            <div
              className="card"
              style={{ textAlign: "center", fontWeight: 600, background: "var(--danger)", color: "#fff" }}
            >
              Hard Exam
              <span className="exam-tile-tooltip">
                Gagne encore plus de <ShekelIcon size={12} style={{ verticalAlign: -1 }} /> avec cet examen bonus!
              </span>
            </div>
          </Link>
        )}

        <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
          {confirmingReset ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <p className="muted" style={{ margin: 0, fontSize: "0.8em", textAlign: "center" }}>
                Toute ta progression sera perdue et tu recommenceras depuis l'onboarding. Confirmer ?
              </p>
              <div style={{ display: "flex", gap: 16 }}>
                <button type="button" className="link-btn" style={{ color: "var(--danger)" }} onClick={handleReset}>
                  Oui, réinitialiser
                </button>
                <button type="button" className="link-btn" onClick={() => setConfirmingReset(false)}>
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="link-btn"
              style={{ color: "var(--textMuted)", fontSize: "0.8em" }}
              onClick={() => setConfirmingReset(true)}
            >
              Réinitialiser mon compte
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
