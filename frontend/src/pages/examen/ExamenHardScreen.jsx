import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getExamenHardStatus } from "../../api/content";
import { ShekelIcon } from "../../components/ShekelIcon";
import "../screens.css";

export default function ExamenHardScreen() {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);

  useEffect(() => {
    getExamenHardStatus().then(setStatus);
  }, []);

  if (!status) return null;

  return (
    <section className="screen">
      <h1>Hard Exam</h1>
      <div className="card" style={{ textAlign: "start", width: "100%", maxWidth: 320, fontSize: "0.85em" }}>
        <p style={{ margin: 0, fontWeight: 600, color: "var(--text)" }}>Modalités :</p>
        <ul
          style={{
            margin: "4px 0 0",
            paddingInlineStart: "1.2em",
            color: "var(--textMuted)",
            fontStyle: "italic",
            fontSize: "0.8em",
          }}
        >
          <li>Le top {status.total_questions} des questions les plus difficiles pour vous</li>
          <li>Vous devez cumuler {Math.round(status.pass_threshold * 100)}% de bonnes réponses pour réussir l'examen</li>
          <li>Vous n'avez le droit qu'à un unique essai</li>
          <li>Épreuve chronométrée de {status.timer_minutes} minutes</li>
          <li>
            À gagner : {status.points_a_gagner}{" "}
            <ShekelIcon size={12} style={{ verticalAlign: -1 }} />
          </li>
        </ul>
      </div>

      <button
        type="button"
        className={`exam-tile ${status.unlocked ? "green" : "grey"}`}
        style={status.unlocked ? { cursor: "pointer" } : undefined}
        disabled={!status.unlocked}
        onClick={status.unlocked ? () => navigate("/examen/hard/passer") : undefined}
      >
        Commencer
      </button>
    </section>
  );
}
