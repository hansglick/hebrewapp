import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { displayChapitreLabel } from "../../utils/chapitreDisplay";
import { displayLessonNumber } from "../../utils/lessonDisplay";
import { mediaUrl } from "../../api/media";
import { NiveauUpScreen } from "./NiveauUpScreen";

const FORMAT_LABELS = { ecrit: "écrit", oral: "oral" };

const labelStyle = { fontWeight: 600, color: "var(--textSecondary)", fontSize: "0.75em" };
const valueStyle = { color: "var(--textPrimary)", fontSize: "0.75em" };

export function ExamenBilanScreen({ code, finalResult, onRetour }) {
  const navigate = useNavigate();
  const { current, niveau_updated: niveauUpdated, attempt_id: attemptId } = finalResult;
  const [showFelicitations, setShowFelicitations] = useState(false);
  const chapId = code.split(".")[0];

  if (showFelicitations) {
    return <NiveauUpScreen code={code} finalResult={finalResult} />;
  }

  return (
    <section className="screen">
      {/* Même police (taille non gras 1.4em + niveau en gras) que le titre
          de NiveauUpScreen ("montée de niveau") — cf. demande explicite du
          user. */}
      <h1 style={{ textAlign: "center", fontWeight: 400, fontSize: "1.4em" }}>
        Bilan de l'examen ({FORMAT_LABELS[current.exam_type]}){" "}
        <strong style={{ fontWeight: 600, fontSize: "0.5em" }}>
          {displayChapitreLabel(chapId)}.{displayLessonNumber(code)}
        </strong>
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
          {/* Renvoie vers la copie de l'examen que l'étudiant vient de
              passer (clic sur le logo) — cf. demande explicite du user. */}
          {attemptId != null && (
            // Puce manquante corrigée : display:"flex" posé directement sur
            // le <li> lui remplaçait son display:"list-item" par défaut,
            // supprimant la puce — cf. bug rapporté par le user. Le flex
            // passe maintenant sur un <span> imbriqué, le <li> retrouve son
            // display par défaut et sa puce.
            <li>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={labelStyle}>Consultez ma copie</span>
                <button
                  type="button"
                  onClick={() => navigate(`/examen/copies/${attemptId}`)}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", lineHeight: 0 }}
                >
                  <img src={mediaUrl("logos/document.png")} alt="Consulter ma copie" style={{ width: 24, height: 24 }} />
                </button>
              </span>
            </li>
          )}
        </ul>
      </div>

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
