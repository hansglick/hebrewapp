// Sélection par double-tap (au lieu d'un bouton "Valider" séparé) :
// - 1er tap sur une bulle -> sélection (vert clair, cf. .quizz-bubble.selected),
//   affiche le message "appuie à nouveau pour valider" côté appelant.
// - 2e tap sur CETTE MÊME bulle -> valide (onConfirm). Taper une bulle
//   différente pendant qu'une autre est sélectionnée déplace simplement la
//   sélection (1er tap sur la nouvelle bulle), ne valide jamais par erreur.
// Cf. demande explicite du user, appliqué à tous les objets quizz
// (révisions et examens, qui réutilisent tous ce composant).
export function QuizzBubbles({ options, correctKey, selectedKey, onSelect, onConfirm, disabled }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: 8,
        maxWidth: 320,
      }}
    >
      {options.map((opt) => {
        let stateClass = "";
        if (disabled) {
          if (opt.key === correctKey) stateClass = " correct";
          else if (opt.key === selectedKey) stateClass = " wrong";
        } else if (opt.key === selectedKey) {
          stateClass = " selected";
        }
        function handleClick() {
          if (opt.key === selectedKey) onConfirm?.();
          else onSelect?.(opt.key);
        }
        return (
          <button
            key={opt.key}
            type="button"
            className={`quizz-bubble hebrew${stateClass}`}
            disabled={disabled}
            onClick={onSelect || onConfirm ? handleClick : undefined}
          >
            {opt.hebrew}
          </button>
        );
      })}
    </div>
  );
}
