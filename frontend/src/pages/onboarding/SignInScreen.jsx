import { useState } from "react";
import { loginAccount } from "../../api/auth";
import { setIdentity } from "../../api/identity";
import { sanitizePseudo } from "../../utils/pseudo";
import HebrewInput from "../../components/HebrewInput";
import "./AuthScreens.css";

export default function SignInScreen({ onSignedIn, onBack }) {
  const [pseudo, setPseudo] = useState("");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit() {
    const cleaned = pseudo.trim();
    if (!cleaned || !pin) return;
    setSubmitting(true);
    setError(null);
    try {
      await loginAccount(cleaned, pin);
      setIdentity(cleaned, pin);
      onSignedIn();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="screen">
      <p className="muted" style={{ fontSize: "0.85em", margin: 0 }}>
        Pseudo
      </p>
      <div className="auth-pseudo-input" style={{ width: "100%", maxWidth: 320 }}>
        <HebrewInput value={pseudo} onChange={(v) => setPseudo(sanitizePseudo(v))} rows={1} placeholder="שם..." showVoicePrefill={false} />
      </div>

      <p className="muted" style={{ fontSize: "0.85em", margin: "1em 0 0" }}>
        Password
      </p>
      <input
        type="password"
        inputMode="numeric"
        className="auth-pin-input"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
      />

      {error && (
        <p className="muted" style={{ color: "var(--annulationPleine)" }}>
          {error}
        </p>
      )}

      <button
        type="button"
        className="exam-tile green auth-submit-btn"
        style={{ cursor: "pointer", marginTop: 24 }}
        disabled={!pseudo.trim() || pin.length !== 4 || submitting}
        onClick={handleSubmit}
      >
        Se connecter
      </button>

      <p className="muted" style={{ fontSize: "0.85em" }}>
        <button type="button" className="link-btn" style={{ fontSize: "1em", display: "inline" }} onClick={onBack}>
          Pas encore de compte
        </button>
      </p>
    </section>
  );
}
