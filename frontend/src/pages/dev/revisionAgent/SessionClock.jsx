const formatClock = (secs) =>
  `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

// État de la séance, en tuile à côté du bouton « Arrêter la séance » et de la
// même taille (cf. demande explicite du user) : connexion, puis chrono.
export default function SessionClock({ status, seconds }) {
  return (
    <div className="ra-clock" aria-live="polite">
      {status === "live" ? (
        <>
          <span className="ra-dot" />
          <span className="ra-mono">{formatClock(seconds)}</span>
        </>
      ) : (
        "Connexion…"
      )}
    </div>
  );
}
