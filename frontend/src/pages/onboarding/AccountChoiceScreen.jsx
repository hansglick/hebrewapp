import "../screens.css";

// Toute première page vue par un user inconnu : rien d'autre que cette
// question, cf. demande explicite du user.
export default function AccountChoiceScreen({ onYes, onNo }) {
  return (
    <section className="screen">
      {/* 1.4em = 2em (taille par défaut d'un h1) * 0.7 : -30%, cf. demande
          explicite du user. */}
      <h1 style={{ fontSize: "1.4em", fontWeight: 400 }}>As-tu déjà un compte ?</h1>
      <button type="button" className="exam-tile green" style={{ cursor: "pointer" }} onClick={onYes}>
        Oui
      </button>
      <button type="button" className="exam-tile red" style={{ cursor: "pointer" }} onClick={onNo}>
        Non
      </button>
    </section>
  );
}
