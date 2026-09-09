import { useState } from "react";
import { loginAccount } from "../../api/auth";
import { setIdentity } from "../../api/identity";
import { sanitizePseudo } from "../../utils/pseudo";
import HebrewInput from "../../components/HebrewInput";
import { SectionTitle } from "../../components/QuoteBlock";
import "./AuthScreens.css";

// Même pastille numérotée que les titres de l'écran révision/verbe (cf.
// VerbeScreen.jsx::StepBadge, même taille/police) — cf. demande explicite
// du user ("inspire-toi des écrans révisions/verbes").
const STEP_BADGE_SIZE = 25;
function StepBadge({ number, background, color }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: STEP_BADGE_SIZE,
        height: STEP_BADGE_SIZE,
        borderRadius: "50%",
        background,
        color,
        fontSize: "0.9375em",
        fontWeight: 700,
        marginRight: 12,
        flexShrink: 0,
      }}
    >
      {number}
    </span>
  );
}

// Même format de trait que l'écran révision/verbe (StepBadge/SectionTitle
// ci-dessus) — cf. demande explicite du user.
const stepHr = <hr style={{ width: "70%", maxWidth: 320, border: "none", borderTop: "1px solid var(--cardBorder)", margin: "16px 0" }} />;

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
      <div style={{ width: "70%", maxWidth: 320, display: "flow-root" }}>
        <SectionTitle fontSize="0.84em">
          <StepBadge number={1} background="#dbeafe" color="#1d4ed8" />
          Entre ton pseudo
        </SectionTitle>
      </div>
      <div className="auth-pseudo-input" style={{ width: "100%", maxWidth: 320 }}>
        <HebrewInput
          value={pseudo}
          onChange={(v) => setPseudo(sanitizePseudo(v))}
          rows={1}
          placeholder="שם..."
          showVoicePrefill={false}
          forceKeyboardHidden
        />
      </div>

      {stepHr}

      <div style={{ width: "70%", maxWidth: 320, display: "flow-root" }}>
        <SectionTitle fontSize="0.84em">
          <StepBadge number={2} background="#dbeafe" color="#1d4ed8" />
          Entre ton mot de passe
        </SectionTitle>
      </div>
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

      {stepHr}

      <div style={{ width: "70%", maxWidth: 320, display: "flow-root" }}>
        <SectionTitle fontSize="0.84em">
          <StepBadge number={3} background="var(--validationGrisee)" color="var(--validationPleine)" />
          Connecte-toi
        </SectionTitle>
      </div>
      <button
        type="button"
        className="exam-tile green auth-submit-btn"
        style={{ cursor: "pointer", marginTop: 16 }}
        disabled={!pseudo.trim() || pin.length !== 4 || submitting}
        onClick={handleSubmit}
      >
        Se connecter
      </button>

      {/* pas de souligné, gris (var(--textSecondary), pas var(--accent) du
          .link-btn partagé) — cf. demande explicite du user. fontSize
          0.75em (au lieu de 1em) : réduit de 25%. marginTop -4px : le
          "gap:16" du flex .screen (screens.css) + ce marginTop donnaient
          24px d'écart avec le bouton au-dessus ; -4px ramène ce total à
          12px, soit -50% — cf. demande explicite du user. */}
      <p className="muted" style={{ fontSize: "0.85em", margin: "-4px 0 0" }}>
        <button
          type="button"
          className="link-btn"
          style={{ fontSize: "0.75em", display: "inline", textDecoration: "none", color: "var(--textSecondary)" }}
          onClick={onBack}
        >
          Pas encore de compte
        </button>
      </p>
    </section>
  );
}
