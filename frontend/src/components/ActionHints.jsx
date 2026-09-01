import "./ActionHints.css";

export function ActionHints({ digits }) {
  return (
    <div aria-hidden="true">
      {digits && <div className="action-hint action-hint-digits">1 : ✓ &nbsp;&nbsp; 0 : ✗</div>}
    </div>
  );
}
