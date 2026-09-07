// Pied commun à toutes les pistes audio de l'application (lecture/pause +
// onde) : compteur minutes:secondes écoulé / durée totale (ex: "0:00 / 2:34"),
// justifié à gauche, et pastille de vitesse de lecture (1x/2x/0.75x, cycle au
// clic) à l'extrémité droite — cf. demande explicite du user.
export function PLAYBACK_RATE_CYCLE(rate) {
  if (rate === 1) return 2;
  if (rate === 2) return 0.75;
  return 1;
}

function formatMinutesSeconds(totalSeconds) {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function AudioTrackFooter({ currentTime, duration, rate, onCycleRate }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        marginTop: 4,
      }}
    >
      <span
        style={{
          fontSize: "0.7em",
          color: "var(--textSecondary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {/* "-:- / -:-" tant que la durée est inconnue (pas encore de piste
            à lire — enregistrement pas encore effectué, ou métadonnées pas
            encore chargées) plutôt que "0:00 / 0:00", cf. demande explicite
            du user. */}
        {Number.isFinite(duration) && duration > 0
          ? `${formatMinutesSeconds(currentTime)} / ${formatMinutesSeconds(duration)}`
          : "-:- / -:-"}
      </span>
      <button
        type="button"
        onClick={onCycleRate}
        style={{
          background: "var(--cardBorder)",
          color: "var(--textSecondary)",
          border: "none",
          borderRadius: 999,
          padding: "2px 8px",
          fontSize: "0.65em",
          fontWeight: 600,
          lineHeight: 1.4,
          cursor: "pointer",
        }}
      >
        {rate}x
      </button>
    </div>
  );
}
