import { useConfig } from "../config/ConfigContext";
import "./ConfigModal.css";

// Réutilise les styles .config-modal-row/.switch de ConfigModal (même
// composant visuel que Thème/God Mode) — affiché sur l'écran de
// confirmation avant de démarrer un examen, cf. demande explicite du user.
export function EvalWaitModeToggle() {
  const { evalWaitMode, setEvalWaitMode } = useConfig();
  const isGlobal = evalWaitMode === "global";

  return (
    <div className="config-modal-row" style={{ width: "100%", maxWidth: 320 }}>
      <span>
        {isGlobal ? "Attendre l'évaluation globale" : "Attendre chaque solution"}
        <br />
        <span className="muted" style={{ fontSize: "0.75em" }}>
          {isGlobal
            ? "Les réponses sont évaluées d'un coup à la fin de l'examen."
            : "Chaque réponse est évaluée immédiatement après l'envoi."}
        </span>
      </span>
      <button
        type="button"
        className={`switch${isGlobal ? " on" : ""}`}
        role="switch"
        aria-checked={isGlobal}
        aria-label="Basculer le mode d'évaluation"
        onClick={() => setEvalWaitMode(isGlobal ? "each" : "global")}
      >
        <span className="switch-knob" />
      </button>
    </div>
  );
}
