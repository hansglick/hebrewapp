// Logo "microphone" — microphone.png (backend/results/logos) est une
// silhouette monochrome avec un vrai canal alpha : on la recolore en blanc
// via un masque CSS plutôt que d'utiliser <img>, posée sur un badge rond.
// Sert aussi de bouton démarrer/arrêter la conversation (JdrScreen) : vert
// au repos, rouge + halo pulsant pendant que la conversation est en cours.
export function MicrophoneIcon({ size = 32, badgeColor = "var(--success)", pulsing = false, onClick }) {
  const iconSize = Math.round(size * 0.55);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={pulsing ? "Arrêter la conversation" : "Démarrer la conversation"}
      className={pulsing ? "mic-pulse" : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        background: badgeColor,
        color: "var(--danger)",
        border: "none",
        padding: 0,
        cursor: "pointer",
        flexShrink: 0,
        transition: "background-color 0.2s",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: iconSize,
          height: iconSize,
          backgroundColor: "#fff",
          WebkitMaskImage: "url(/microphone.png)",
          maskImage: "url(/microphone.png)",
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
        }}
      />
    </button>
  );
}
