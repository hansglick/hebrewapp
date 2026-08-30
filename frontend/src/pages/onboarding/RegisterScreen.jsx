import { useState } from "react";
import { registerAccount } from "../../api/auth";
import { setIdentity } from "../../api/identity";
import { PSEUDO_MAX_LENGTH, sanitizePseudo } from "../../utils/pseudo";
import HebrewInput from "../../components/HebrewInput";

const PIN_LENGTH = 4;

function pinInputStyle() {
  return {
    width: "100%",
    maxWidth: 320,
    boxSizing: "border-box",
    fontSize: "1.1em",
    letterSpacing: "0.3em",
    textAlign: "center",
    background: "var(--surface)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 12px",
    outline: "none",
  };
}

export default function RegisterScreen({ onRegistered, onBackToSignIn }) {
  const [pseudo, setPseudo] = useState("");
  const [pin1, setPin1] = useState("");
  const [pin2, setPin2] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const pinValid = /^\d{4}$/.test(pin1);
  const pinsMatch = pin1 === pin2;
  const canSubmit = pseudo.trim() && pinValid && pin2.length === PIN_LENGTH && pinsMatch;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await registerAccount(pseudo.trim(), pin1);
      setIdentity(pseudo.trim(), pin1);
      onRegistered();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handlePinChange(setter) {
    return (e) => setter(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH));
  }

  return (
    <section className="screen">
      <h1>Créer un compte</h1>

      <p className="muted" style={{ fontSize: "0.85em", margin: 0 }}>
        Ton pseudo (en hébreu, {PSEUDO_MAX_LENGTH} caractères maximum)
      </p>
      <HebrewInput
        value={pseudo}
        onChange={(v) => setPseudo(sanitizePseudo(v))}
        rows={1}
        placeholder="שם..."
        showVoicePrefill={false}
      />

      <p className="muted" style={{ fontSize: "0.85em", margin: "1em 0 0" }}>
        Choisis un code à 4 chiffres
      </p>
      <input
        type={revealed ? "text" : "password"}
        inputMode="numeric"
        value={pin1}
        onChange={handlePinChange(setPin1)}
        style={pinInputStyle()}
      />
      <input
        type={revealed ? "text" : "password"}
        inputMode="numeric"
        value={pin2}
        onChange={handlePinChange(setPin2)}
        style={pinInputStyle()}
      />
      <button
        type="button"
        className="link-btn"
        style={{ fontSize: "0.8em" }}
        onClick={() => setRevealed((r) => !r)}
      >
        {revealed ? "Masquer le code" : "Afficher le code"}
      </button>

      {pin1 && pin2 && !pinsMatch && (
        <p className="muted" style={{ color: "var(--danger)", fontSize: "0.8em", margin: 0 }}>
          Les deux codes ne correspondent pas.
        </p>
      )}

      {error && (
        <p className="muted" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <button
        type="button"
        className="exam-tile green"
        style={{ cursor: "pointer" }}
        disabled={!canSubmit || submitting}
        onClick={handleSubmit}
      >
        Créer mon compte
      </button>

      <button type="button" className="link-btn" style={{ fontSize: "0.85em" }} onClick={onBackToSignIn}>
        Déjà un compte ? Se connecter
      </button>
    </section>
  );
}
