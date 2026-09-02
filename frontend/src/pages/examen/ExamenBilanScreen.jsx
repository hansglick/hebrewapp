import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { displayLessonCode } from "../../utils/lessonDisplay";
import { NiveauUpScreen } from "./NiveauUpScreen";

const FORMAT_LABELS = { ecrit: "écrit", oral: "oral" };

const labelStyle = { fontStyle: "italic", color: "var(--textMuted)", fontSize: "0.75em" };
const valueStyle = { color: "var(--text)", fontSize: "0.75em" };
const plainLinkStyle = {
  background: "none",
  border: "none",
  padding: 0,
  color: "var(--text)",
  fontSize: "0.75em",
  fontStyle: "normal",
  textDecoration: "none",
  cursor: "pointer",
};

// Une pastille par tentative (grise = pas encore faite, rouge = échouée,
// verte = réussie), du plus ancien au plus récent — cf. history renvoyé par
// _finalize/abandon_session. Chaque pastille réelle (id non nul) est
// cliquable et renvoie vers sa copie.
function AttemptPastilles({ history }) {
  const navigate = useNavigate();
  return (
    <span style={{ display: "inline-flex", gap: 6, verticalAlign: "middle" }}>
      {history.map((h, i) => (
        <span
          key={i}
          className="binyan-pill"
          role={h.id != null ? "button" : undefined}
          tabIndex={h.id != null ? 0 : undefined}
          onClick={h.id != null ? () => navigate(`/examen/copies/${h.id}`) : undefined}
          style={{
            margin: 0,
            cursor: h.id != null ? "pointer" : "default",
            backgroundColor: h.passed === null ? "var(--textMuted)" : h.passed ? "var(--success)" : "var(--danger)",
          }}
        />
      ))}
    </span>
  );
}

export function ExamenBilanScreen({ code, finalResult, onRetour }) {
  const navigate = useNavigate();
  const { current, niveau_updated: niveauUpdated, history, attempt_id: attemptId } = finalResult;
  const [showFelicitations, setShowFelicitations] = useState(false);

  if (showFelicitations) {
    return <NiveauUpScreen code={code} finalResult={finalResult} />;
  }

  return (
    <section className="screen">
      <h1>
        Examen {displayLessonCode(code)} / {FORMAT_LABELS[current.exam_type]}
      </h1>

      <ul style={{ margin: 0, paddingInlineStart: "1.2em", textAlign: "start" }}>
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
          <span style={{ color: current.passed ? "var(--success)" : "var(--danger)", fontSize: "0.75em" }}>
            {current.passed ? "Réussite" : "Échec"}
          </span>
        </li>
        {attemptId != null && (
          <li>
            <button type="button" style={plainLinkStyle} onClick={() => navigate(`/examen/copies/${attemptId}`)}>
              Consulter ma copie
            </button>
          </li>
        )}
      </ul>

      <hr style={{ width: "100%", maxWidth: 320, border: "none", borderTop: "1px solid var(--border)" }} />

      <h2 style={{ fontSize: "1.1em", fontWeight: 400, margin: 0 }}>Situation</h2>
      <ul style={{ margin: 0, paddingInlineStart: "1.2em", textAlign: "start" }}>
        <li>
          <span style={labelStyle}>Écrit : </span>
          <AttemptPastilles history={history.ecrit} />
        </li>
        <li>
          <span style={labelStyle}>Oral : </span>
          <AttemptPastilles history={history.oral} />
        </li>
        <li>
          <span style={labelStyle}>Tentatives restantes aujourd'hui : </span>
          <span style={labelStyle}>écrit</span> <span style={valueStyle}>{finalResult.attempts_remaining_ecrit}</span>
          {", "}
          <span style={labelStyle}>oral</span> <span style={valueStyle}>{finalResult.attempts_remaining_oral}</span>
        </li>
      </ul>

      <hr style={{ width: "100%", maxWidth: 320, border: "none", borderTop: "1px solid var(--border)" }} />

      {niveauUpdated ? (
        <button type="button" style={plainLinkStyle} onClick={() => setShowFelicitations(true)}>
          Bravo, continuer →
        </button>
      ) : (
        <p style={{ margin: 0, fontSize: "0.75em", color: "var(--textMuted)", fontStyle: "italic" }}>
          Encore un peu d'efforts
        </p>
      )}

      <button type="button" className="link-btn" onClick={onRetour}>
        Retour à l'examen
      </button>
    </section>
  );
}
