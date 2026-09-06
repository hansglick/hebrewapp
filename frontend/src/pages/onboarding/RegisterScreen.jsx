import { useState } from "react";
import { registerAccount } from "../../api/auth";
import { setIdentity } from "../../api/identity";
import { sanitizePseudo } from "../../utils/pseudo";
import HebrewInput from "../../components/HebrewInput";
import "./AuthScreens.css";

const PIN_LENGTH = 4;

export default function RegisterScreen({ onRegistered, onBack }) {
  const [pseudo, setPseudo] = useState("");
  const [pin1, setPin1] = useState("");
  const [pin2, setPin2] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const pinValid = /^\d{4}$/.test(pin1);
  const pinIncomplete = pin1.length > 0 && pin1.length < PIN_LENGTH;
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
      <p className="muted" style={{ fontSize: "0.85em", margin: 0 }}>
        Choisis ton pseudo
      </p>
      <div className="auth-pseudo-input" style={{ width: "100%", maxWidth: 320 }}>
        <HebrewInput
          value={pseudo}
          onChange={(v) => setPseudo(sanitizePseudo(v))}
          rows={1}
          placeholder="שם..."
          showVoicePrefill={false}
        />
      </div>

      <p className="muted" style={{ fontSize: "0.85em", margin: "1em 0 0" }}>
        Choisis ton password, seulement 4 chiffres
      </p>
      <input
        type={revealed ? "text" : "password"}
        inputMode="numeric"
        className="auth-pin-input"
        value={pin1}
        onChange={handlePinChange(setPin1)}
      />

      <p className="muted" style={{ fontSize: "0.85em", margin: "1em 0 0" }}>
        Re-saisi ton password
      </p>
      <input
        type={revealed ? "text" : "password"}
        inputMode="numeric"
        className="auth-pin-input"
        value={pin2}
        onChange={handlePinChange(setPin2)}
      />

      <button type="button" className="link-btn" style={{ fontSize: "0.8em" }} onClick={() => setRevealed((r) => !r)}>
        {revealed ? "Masquer le code" : "Afficher le code"}
      </button>

      {pinIncomplete && (
        <p className="muted" style={{ color: "var(--annulationPleine)", fontSize: "0.8em", margin: 0 }}>
          Le password doit contenir exactement 4 chiffres.
        </p>
      )}
      {pin1 && pin2 && !pinsMatch && (
        <p className="muted" style={{ color: "var(--annulationPleine)", fontSize: "0.8em", margin: 0 }}>
          Les deux codes ne correspondent pas.
        </p>
      )}

      {error && (
        <p className="muted" style={{ color: "var(--annulationPleine)" }}>
          {error}
        </p>
      )}

      <button
        type="button"
        className="exam-tile green auth-submit-btn"
        style={{ cursor: "pointer", marginTop: 24 }}
        disabled={!canSubmit || submitting}
        onClick={handleSubmit}
      >
        Créer ton compte
      </button>

      <p className="muted" style={{ fontSize: "0.85em" }}>
        <button type="button" className="link-btn" style={{ fontSize: "1em", display: "inline" }} onClick={onBack}>
          Déjà un compte
        </button>
      </p>
    </section>
  );
}
