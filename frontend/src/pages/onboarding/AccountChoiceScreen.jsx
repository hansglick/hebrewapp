import "../screens.css";

// Toute première page vue par un user inconnu : rien d'autre que cette
// question, cf. demande explicite du user.
export default function AccountChoiceScreen({ onYes, onNo }) {
  return (
    <section className="screen">
      <h1>As-tu déjà un compte ?</h1>
      <button type="button" className="exam-tile green" style={{ cursor: "pointer" }} onClick={onYes}>
        Oui
      </button>
      <button type="button" className="exam-tile red" style={{ cursor: "pointer" }} onClick={onNo}>
        Non
      </button>
    </section>
  );
}
