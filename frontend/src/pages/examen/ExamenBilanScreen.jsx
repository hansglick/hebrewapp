import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { displayLessonCode } from "../../utils/lessonDisplay";
import { NiveauUpScreen } from "./NiveauUpScreen";

const FORMAT_LABELS = { ecrit: "écrit", oral: "oral" };

const labelStyle = { fontStyle: "italic", color: "var(--textSecondary)", fontSize: "0.75em" };
const valueStyle = { color: "var(--textPrimary)", fontSize: "0.75em" };

export function ExamenBilanScreen({ code, finalResult, onRetour }) {
  const navigate = useNavigate();
  const { current, niveau_updated: niveauUpdated, attempt_id: attemptId } = finalResult;
  const [showFelicitations, setShowFelicitations] = useState(false);

  if (showFelicitations) {
    return <NiveauUpScreen code={code} finalResult={finalResult} />;
  }

  return (
    <section className="screen">
      <h1>
        Examen {displayLessonCode(code)} / {FORMAT_LABELS[current.exam_type]}
      </h1>

      <div className="card" style={{ textAlign: "start", width: "100%", maxWidth: 320, fontSize: "0.85em" }}>
        <p style={{ margin: 0, fontWeight: 600, color: "var(--textPrimary)" }}>Bilan de l'examen</p>
        <ul style={{ margin: "4px 0 0", paddingInlineStart: "1.2em" }}>
          <li>
            <span style={labelStyle}>Note moyenne : </span>
            <span style={valueStyle}>{current.average_note.toFixed(1)} / 5</span>
          </li>
          <li>
            <span style={labelStyle}>Taux de réponses ≥4★ (requis : 70%) : </span>
            <span style={valueStyle}>{Math.round(current.success_ratio * 100)}%</span>
          </li>
          <li>
            <span style={labelStyle}>Statut : </span>
            <span style={{ color: current.passed ? "var(--validationPleine)" : "var(--annulationPleine)", fontSize: "0.75em" }}>
              {current.passed ? "Réussite" : "Échec"}
            </span>
          </li>
        </ul>
      </div>

      {/* Renvoie vers la copie de l'examen que l'étudiant vient de passer —
          cf. demande explicite du user. */}
      {attemptId != null && (
        <button type="button" className="link-btn" onClick={() => navigate(`/examen/copies/${attemptId}`)}>
          Consulter ma copie
        </button>
      )}

      {/* Si les deux examens (écrit et oral) sont réussis, montre l'écran de
          félicitations pour la montée de niveau ; sinon, retourne à la page
          de l'examen (retenter/faire le format manquant) — cf. demande
          explicite du user. */}
      <button
        type="button"
        className="exam-tile green"
        style={{ cursor: "pointer" }}
        onClick={() => (niveauUpdated ? setShowFelicitations(true) : onRetour())}
      >
        Continuez
      </button>
    </section>
  );
}
