const STEPS = [
  { phase: "greeting", label: "Accueil" },
  { phase: "instruction", label: "Consigne" },
  { phase: "reading", label: "Lecture" },
  { phase: "verdict", label: "Verdict" },
];

const PHASE_HINT = {
  greeting: "Le prof se présente",
  instruction: "Le prof donne la consigne",
  reading: "À toi de lire le texte à voix haute",
  verdict: "Analyse de ta lecture…",
  done: "Séance terminée — tu peux arrêter",
};

const formatClock = (secs) =>
  `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

// État de la séance : connexion, chrono et, pour la lecture, les étapes (des
// arcs tournent autour de l'étape « Verdict » pendant l'évaluation).
export default function SessionSteps({ status, phase, seconds, showSteps }) {
  const currentStep =
    phase === "done" ? STEPS.length : STEPS.findIndex((s) => s.phase === phase);

  return (
    <div className="card ra-stage" aria-live="polite">
      <div className="ra-status">
        {status === "connecting" && <strong>Connexion…</strong>}
        {status === "live" && (
          <>
            <span className="ra-live">
              <span className="ra-dot" />
              Conversation en cours
            </span>
            <span className="ra-mono">{formatClock(seconds)}</span>
          </>
        )}
      </div>
      {showSteps && status === "live" && phase && (
        <span className="muted">{PHASE_HINT[phase]}</span>
      )}

      {showSteps && (
        <ol className="ra-steps" aria-label="Étapes de la séance">
          {STEPS.map((s, i) => {
            const state =
              i < currentStep ? "done" : i === currentStep ? "current" : "todo";
            const busy = s.phase === "verdict" && phase === "verdict";
            return (
              <li
                key={s.phase}
                className={`ra-step ra-step-${state}`}
                aria-current={state === "current" ? "step" : undefined}
              >
                <span className="ra-step-dot">
                  {state === "done" ? "✓" : i + 1}
                  {busy && (
                    <span className="ra-spinner" aria-hidden="true">
                      <span />
                      <span />
                    </span>
                  )}
                </span>
                {s.label}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
