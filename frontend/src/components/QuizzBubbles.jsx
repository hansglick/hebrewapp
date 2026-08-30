export function QuizzBubbles({ options, correctKey, selectedKey, onSelect, disabled }) {
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
          stateClass = " active";
        }
        return (
          <button
            key={opt.key}
            type="button"
            className={`quizz-bubble hebrew${stateClass}`}
            disabled={disabled}
            onClick={onSelect ? () => onSelect(opt.key) : undefined}
          >
            {opt.hebrew}
          </button>
        );
      })}
    </div>
  );
}
