import "./ActionHints.css";

export function ActionHints({ left, right, space, digits }) {
  return (
    <div aria-hidden="true">
      {left && <div className="action-hint action-hint-left">← précédent</div>}
      {right && <div className="action-hint action-hint-right">item suivant →</div>}
      {space && <div className="action-hint action-hint-space">espace : en savoir plus</div>}
      {digits && <div className="action-hint action-hint-digits">1 : ✓ &nbsp;&nbsp; 0 : ✗</div>}
    </div>
  );
}
