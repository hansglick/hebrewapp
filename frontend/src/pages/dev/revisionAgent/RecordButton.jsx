import { useState } from "react";

// Réponse à voix haute (cf. demande explicite du user) : un bouton rond, ocre.
// On le touche : le micro s'ouvre et, en lecture avec assistance, la
// transcription en direct se connecte (cf. live_transcribe.py). Tant que ce
// n'est pas prêt (ready), un anneau tourne autour du bouton : « Patientez
// quelques instants… » ; prêt, un carré blanc apparaît dans le bouton, qui
// pulse : « Parlez ». On touche le carré : l'enregistrement s'arrête et part.
// À droite, la corbeille l'annule.

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" fill="none" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ra-stop" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2.5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6.5h16M9.5 6.5V4.5h5v2M6.5 6.5l1 13.5h9l1-13.5M10 10v6.5M14 10v6.5" fill="none" />
    </svg>
  );
}

export default function RecordButton({ recording, ready, onStart, onStop, onCancel, disabled }) {
  const [opening, setOpening] = useState(false); // touché : le micro s'ouvre
  const waiting = opening || (recording && !ready);
  const live = recording && ready;

  const press = async () => {
    if (live) {
      onStop();
      return;
    }
    if (recording || opening || disabled) return;
    setOpening(true);
    try {
      await onStart();
    } finally {
      setOpening(false);
    }
  };

  const status = live ? "Parlez" : waiting ? "Patientez quelques instants…" : "Appuie pour répondre";
  return (
    <div className="ra-record-row">
      <button
        type="button"
        className={`ra-record ${waiting ? "ra-record-waiting" : ""} ${live ? "ra-record-live" : ""}`}
        onClick={press}
        disabled={waiting || (disabled && !recording)}
        aria-label={live ? "Arrêter et envoyer ma réponse" : "Répondre à voix haute"}
        title={live ? "Arrêter et envoyer ma réponse" : undefined}
      >
        {live ? <StopIcon /> : <MicIcon />}
      </button>
      <span className={`ra-record-status ${live ? "ra-record-status-live" : ""}`} role="status" aria-live="polite">
        {status}
      </span>
      <button
        type="button"
        className="ra-record-trash"
        onClick={onCancel}
        disabled={!recording}
        aria-label="Annuler l’enregistrement"
        title="Annuler l’enregistrement"
      >
        <TrashIcon />
      </button>
    </div>
  );
}
