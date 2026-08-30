import { useState } from "react";
import { getBinyan, getRacine } from "../api/content";
import { speak } from "../utils/speech";
import { SpeakerIcon } from "./SpeakerIcon";
import { RacineCard } from "./RacineCard";
import "../pages/screens.css";

const TEMPS_LABELS = [
  { key: "past", label: "passé" },
  { key: "present", label: "présent" },
  { key: "futur", label: "futur" },
];

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Fiche verbe en lecture seule (pas de tabs révision/évaluation), pour un
// affichage inline (ex: dictionnaire). Reprend le mode "exploration" de
// VerbeScreen (toutes les conjugaisons du temps sélectionné affichées d'un
// coup) ainsi que le principe des fiches binyan/racine imbriquées.
export function VerbeCard({ verbe }) {
  const [temps, setTemps] = useState("present");
  const [binyanDetails, setBinyanDetails] = useState(null);
  const [racineDetails, setRacineDetails] = useState(null);

  function toggleBinyanInline() {
    if (binyanDetails) {
      setBinyanDetails(null);
      return;
    }
    getBinyan(verbe.binyan).then(setBinyanDetails);
  }

  function toggleRacineInline() {
    if (racineDetails) {
      setRacineDetails(null);
      return;
    }
    if (verbe.racine) getRacine(verbe.racine).then(setRacineDetails);
  }

  const conjugaisonsTemps = verbe.conjugaisons?.[temps];

  return (
    <div className="card" style={{ textAlign: "center" }}>
      <h2
        style={{
          margin: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexWrap: "nowrap",
          gap: 6,
          fontSize: "1.3em",
        }}
      >
        <button
          type="button"
          className="speak-btn hebrew"
          style={{
            fontSize: "0.7em",
            color: "#64748b",
            fontWeight: 700,
            padding: 0,
            border: "none",
            background: "none",
            appearance: "none",
          }}
          onClick={toggleRacineInline}
        >
          ש
        </button>
        <span style={{ color: "var(--textMuted)", fontWeight: 400, fontSize: "0.7em" }}>|</span>
        <button
          type="button"
          className="speak-btn hebrew"
          style={{
            fontSize: "0.7em",
            color: verbe.binyan_color,
            fontWeight: 700,
            padding: 0,
            border: "none",
            background: "none",
            appearance: "none",
          }}
          onClick={toggleBinyanInline}
        >
          ב
        </button>
        <span
          className="binyan-pill"
          style={{ backgroundColor: verbe.binyan_color, cursor: "pointer", margin: 0 }}
          onClick={toggleBinyanInline}
        />
        <span className="hebrew">{verbe.pure}</span>
        <button
          type="button"
          className="speak-btn"
          style={{ display: "inline-flex", padding: 0, border: "none", background: "none", appearance: "none" }}
          onClick={() => speak(verbe.pure)}
        >
          <SpeakerIcon color="#64748b" size={16} />
        </button>
        <span
          style={{
            fontStyle: "italic",
            fontWeight: 400,
            fontSize: "0.55em",
            color: "var(--textMuted)",
          }}
        >
          {capitalize(verbe.traduction)}
        </span>
      </h2>

      {binyanDetails && (
        <div className="card" style={{ textAlign: "center", marginTop: 12 }}>
          <p className="hebrew-large" style={{ margin: 0, color: binyanDetails.color }}>
            {binyanDetails.text}
          </p>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            {binyanDetails.sens}
          </p>
        </div>
      )}

      {racineDetails && <RacineCard racine={racineDetails} />}

      <div className="toggle-group" style={{ marginTop: "2em", justifyContent: "center" }}>
        {TEMPS_LABELS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={temps === t.key ? "active" : ""}
            style={
              temps === t.key
                ? { backgroundColor: verbe.binyan_color, borderColor: verbe.binyan_color }
                : undefined
            }
            onClick={() => setTemps(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!conjugaisonsTemps && (
        <p className="muted" style={{ fontStyle: "italic", marginTop: 12 }}>
          Conjugaison indisponible pour ce verbe.
        </p>
      )}

      {conjugaisonsTemps && (
        <div style={{ marginTop: 12 }}>
          {Object.values(conjugaisonsTemps).map((c) => (
            <div key={c.personne} style={{ marginBottom: "0.8em" }}>
              <p
                className="hebrew-large"
                style={{
                  margin: 0,
                  color: "var(--text)",
                  fontWeight: 600,
                  fontSize: "calc(var(--font-size-hebrew-large) * 0.7)",
                }}
              >
                {c.conjugaison}
              </p>
              <p className="muted" style={{ margin: "2px 0 0", fontStyle: "italic", fontSize: "0.7em" }}>
                {capitalize(c.personne)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
