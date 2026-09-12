import { useState } from "react";
import { registerAccount } from "../../api/auth";
import { setIdentity } from "../../api/identity";
import { sanitizePseudo } from "../../utils/pseudo";
import HebrewInput from "../../components/HebrewInput";
import { SectionTitle } from "../../components/QuoteBlock";
import "./AuthScreens.css";

const PIN_LENGTH = 4;

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

export default function RegisterScreen({ onRegistered, onBack }) {
  const [pseudo, setPseudo] = useState("");
  const [pin1, setPin1] = useState("");
  const [pin2, setPin2] = useState("");
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
          highlightKeyboardToggle
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
        value={pin1}
        onChange={handlePinChange(setPin1)}
      />

      {/* Pas de trait entre les blocs 2 et 3, et écart réduit de moitié
          (16px -> 8px, via ce marginTop négatif qui vient en plus du
          gap:16 du flex .screen) pour qu'ils paraissent plus proches que
          les autres paires de blocs — cf. demande explicite du user. */}
      <div style={{ width: "70%", maxWidth: 320, display: "flow-root", marginTop: -8 }}>
        <SectionTitle fontSize="0.84em">
          <StepBadge number={3} background="#dbeafe" color="#1d4ed8" />
          Re-entre ton mot de passe
        </SectionTitle>
      </div>
      <input
        type="password"
        inputMode="numeric"
        className="auth-pin-input"
        value={pin2}
        onChange={handlePinChange(setPin2)}
      />

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

      {stepHr}

      <div style={{ width: "70%", maxWidth: 320, display: "flow-root" }}>
        <SectionTitle fontSize="0.84em">
          <StepBadge number={4} background="var(--validationGrisee)" color="var(--validationPleine)" />
          Connecte-toi
        </SectionTitle>
      </div>
      <button
        type="button"
        className="exam-tile green auth-submit-btn"
        style={{ cursor: "pointer" }}
        disabled={!canSubmit || submitting}
        onClick={handleSubmit}
      >
        Créer ton compte
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
          Déjà un compte
        </button>
      </p>
    </section>
  );
}
