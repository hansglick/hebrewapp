import { useState } from "react";
import { loginAccount } from "../../api/auth";
import { setIdentity } from "../../api/identity";
import { sanitizePseudo } from "../../utils/pseudo";
import HebrewInput from "../../components/HebrewInput";
import RegisterScreen from "./RegisterScreen";

export default function SignInScreen({ onSignedIn }) {
  const [mode, setMode] = useState("signin"); // "signin" | "register"
  const [pseudo, setPseudo] = useState("");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (mode === "register") {
    return <RegisterScreen onRegistered={onSignedIn} onBackToSignIn={() => setMode("signin")} />;
  }

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
      <h1>Connexion</h1>

      <p className="muted" style={{ fontSize: "0.85em", margin: 0 }}>
        Ton pseudo (en hébreu)
      </p>
      <HebrewInput value={pseudo} onChange={(v) => setPseudo(sanitizePseudo(v))} rows={1} placeholder="שם..." showVoicePrefill={false} />

      <p className="muted" style={{ fontSize: "0.85em", margin: "1em 0 0" }}>
        Ton code
      </p>
      <input
        type="password"
        inputMode="numeric"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
        style={{
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
        }}
      />

      {error && (
        <p className="muted" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <button
        type="button"
        className="exam-tile green"
        style={{ cursor: "pointer" }}
        disabled={!pseudo.trim() || pin.length !== 4 || submitting}
        onClick={handleSubmit}
      >
        Se connecter
      </button>

      <p className="muted" style={{ fontSize: "0.85em" }}>
        Pas encore de compte ?{" "}
        <button type="button" className="link-btn" style={{ fontSize: "1em", display: "inline" }} onClick={() => setMode("register")}>
          Enregistrez-vous
        </button>
      </p>
    </section>
  );
}
