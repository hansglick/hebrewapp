// Barre de progression générique — `value` en pourcentage (0-100), `color`
// déjà résolue par l'appelant (chaque indicateur a ses propres seuils et cas
// limites, cf. utils/progressColor.js).
export function ProgressBar({ value, color = "var(--accent)" }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="progress-bar-track">
      <div className="progress-bar-fill" style={{ width: `${clamped}%`, background: color }} />
    </div>
  );
}
