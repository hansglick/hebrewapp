import { useEffect, useRef, useState } from "react";

// Réponse à voix haute, comme on déverrouille un téléphone (cf. demande
// explicite du user) : on pousse le loquet (micro) jusqu'au bout de la piste,
// ce qui lance l'enregistrement ; il devient alors un avion en papier, et la
// piste montre une onde et la durée. Un clic sur l'avion arrête et envoie :
// il s'envole, des traits de vitesse filant dans la piste, puis le loquet revient au départ. À
// droite, la corbeille, grisée hors enregistrement, l'arrête et l'annule.
// Lâché avant le bout, le loquet revient au départ.
// Le micro met parfois du temps à s'ouvrir, sur mobile : tant qu'il ne capte
// rien, la piste attend (« patientez… ») ; l'onde et la durée ne partent qu'au
// premier son capté, et l'onde suit alors la voix (levels, les volumes captés,
// cf. demande explicite du user).
// streaming (transcription en direct, cf. live_transcribe.py) : la réponse
// part pendant qu'elle est dite, il n'y a rien à « envoyer » : le loquet
// devient un carré blanc « stop », la piste dit de le toucher pour arrêter, et
// l'arrêt se fait sans avion ni vol (cf. demande explicite du user).

const KNOB = 48; // diamètre du loquet (cf. .ra-slider-knob)
const PAD = 4; // marge entre le loquet et le bord de la piste
const UNLOCK = 0.85; // part de la course à atteindre pour lancer l'enregistrement
const FLIGHT_MS = 1300; // vol de l'avion (cf. @keyframes ra-plane-flight)
const WAVE_BARS = 18; // barres de l'onde, réparties sur toute la piste (cf. .ra-wave)

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" fill="none" />
    </svg>
  );
}

function PlaneIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M21.5 2.5 2.8 10.2l6.6 2.6 2.6 6.6z" />
      <path d="M21.5 2.5 9.4 12.8M12 19.4l1.9-4.6" fill="none" />
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

// Hauteur d'une barre de l'onde, d'un volume (0 à 1) : la voix parlée reste
// loin de 1, d'où la racine.
const barHeight = (level) => Math.min(1, 0.12 + Math.sqrt(level) * 2);

export default function RecordSlider({
  recording,
  onStart,
  onSend,
  onCancel,
  disabled,
  levels = [],
  streaming = false,
}) {
  const trackRef = useRef(null);
  const [drag, setDrag] = useState(null); // {startX, max} pendant qu'on pousse le loquet
  const [offset, setOffset] = useState(0);
  const [armed, setArmed] = useState(false); // poussé au bout : le micro s'ouvre
  const [flying, setFlying] = useState(false);
  const [seconds, setSeconds] = useState(0);

  // Le micro capte : la durée part.
  const live = recording && levels.length > 0;
  useEffect(() => {
    if (!live) return undefined;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [live]);

  const idle = !recording && !armed && !flying;
  const atEnd = recording || armed || flying;

  const start = async () => {
    setSeconds(0);
    setArmed(true);
    await onStart();
    setArmed(false);
  };

  const onPointerDown = (e) => {
    if (disabled || !idle) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ startX: e.clientX, max: trackRef.current.clientWidth - KNOB - 2 * PAD });
  };
  const reached = (e) => Math.min(Math.max(e.clientX - drag.startX, 0), drag.max);
  const onPointerMove = (e) => {
    if (drag) setOffset(reached(e));
  };
  // La position se lit sur l'événement : un geste rapide peut lâcher avant que offset soit à jour.
  const onPointerUp = (e) => {
    if (!drag) return;
    setDrag(null);
    const unlocked = reached(e) >= drag.max * UNLOCK;
    setOffset(0);
    if (unlocked) start();
  };

  const onKnobClick = () => {
    if (!recording) return;
    if (streaming) {
      onSend();
      return;
    }
    setFlying(true);
    onSend();
    setTimeout(() => setFlying(false), FLIGHT_MS);
  };
  // Clavier : Entrée ou Espace lance l'enregistrement (le clic sert alors à l'envoyer).
  const onKnobKey = (e) => {
    if (idle && !disabled && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      start();
    }
  };

  const stopLabel = streaming ? "Arrêter ma réponse" : "Envoyer ma réponse";
  return (
    <div className="ra-slider-row">
      <div
        ref={trackRef}
        className={`ra-slider ${recording ? "ra-slider-recording" : ""} ${disabled ? "ra-slider-disabled" : ""}`}
      >
        <div className="ra-slider-inside">
          {idle && (
            <span className="ra-slider-label" style={{ opacity: drag ? 1 - offset / drag.max : 1 }}>
              {/* Sur mobile, la piste est trop courte : « Glisse ››› » (cf. .ra-slider-label-more). */}
              Glisse<span className="ra-slider-label-more"> pour répondre</span>{" "}
              <span className="ra-slider-chevrons">›››</span>
            </span>
          )}
          {(armed || (recording && !live)) && (
            <span className="ra-slider-waiting" role="status">
              <span className="ra-slider-dot" aria-hidden="true" />
              patientez…
            </span>
          )}
          {live && (
            <span className="ra-slider-live">
              {/* Les derniers volumes, le plus récent à droite. */}
              {streaming ? (
                // La piste est étroite : l'onde et la durée laissent la place au geste attendu, toucher le carré pour
                // arrêter ; le verbatim qui s'écrit en direct montre que le micro capte.
                <span className="ra-slider-stop-hint">
                  Touche pour arrêter <span className="ra-slider-chevrons">›</span>
                </span>
              ) : (
                <>
                  <span className="ra-wave" aria-hidden="true">
                    {Array.from({ length: WAVE_BARS }, (_, i) => (
                      <span key={i} style={{ "--level": barHeight(levels[levels.length - WAVE_BARS + i] ?? 0) }} />
                    ))}
                  </span>
                  <span className="ra-slider-time">
                    {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
                  </span>
                </>
              )}
            </span>
          )}
          {flying && (
            <span className="ra-slider-sky" aria-hidden="true">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <span key={n} className={`ra-streak ra-streak-${n}`} />
              ))}
            </span>
          )}
        </div>
        <button
          type="button"
          className={`ra-slider-knob ${atEnd ? "ra-slider-knob-end" : ""} ${drag ? "ra-slider-knob-drag" : ""}`}
          style={atEnd ? undefined : { transform: `translateX(${offset}px)` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={onKnobClick}
          onKeyDown={onKnobKey}
          disabled={disabled && !recording}
          aria-label={recording ? stopLabel : "Glisser pour enregistrer ma réponse"}
          title={recording ? stopLabel : undefined}
        >
          {flying ? (
            // Blanc dans la pastille, ocre hors d'elle (cf. demande explicite du user) : deux avions au même vol.
            <>
              <span className="ra-plane-inside">
                <PlaneIcon className="ra-plane-flight" />
              </span>
              <span className="ra-plane-outside">
                <PlaneIcon className="ra-plane-flight" />
              </span>
            </>
          ) : recording && streaming ? (
            <StopIcon />
          ) : recording ? (
            <PlaneIcon className="ra-plane" />
          ) : (
            <MicIcon />
          )}
        </button>
      </div>
      <button
        type="button"
        className="ra-slider-trash"
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
