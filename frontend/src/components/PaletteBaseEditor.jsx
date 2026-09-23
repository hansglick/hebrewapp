import { useEffect, useState } from "react";
import { PALETTE_V2_BASE_LABELS } from "../config/appConfig";
import "./PaletteBaseEditor.css";

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

function normalizeHex(raw) {
  const v = raw.trim();
  return v.startsWith("#") ? v.toLowerCase() : `#${v.toLowerCase()}`;
}

// Une ligne = une des 8 couleurs de base de la palette V2 (cf. appConfig.js
// PALETTE_V2_BASE_DEFAULTS/computePaletteV2) : pastille + champ hexadécimal
// + pipette (EyeDropper), cf. demande explicite du user. Le champ garde son
// propre brouillon local (au lieu de rester "controlled" par `value`) pour
// ne pas se faire écraser à chaque frappe tant que la valeur tapée n'est
// pas un hex complet valide — ne remonte à `onChange` qu'une fois les 6
// chiffres saisis.
function PaletteBaseRow({ colorKey, value, onChange }) {
  const [draft, setDraft] = useState(value);

  // Resynchronise le brouillon si la vraie valeur change pour une raison
  // EXTÉRIEURE à cette frappe (pipette, réinitialisation) — mais pas à
  // chaque frappe locale, sans quoi un hex partiel tapé serait effacé.
  useEffect(() => {
    setDraft(value);
  }, [value]);

  function handleTextChange(e) {
    const raw = e.target.value;
    setDraft(raw);
    if (HEX_RE.test(raw.trim())) {
      onChange(normalizeHex(raw));
    }
  }

  async function handlePipette() {
    if (!window.EyeDropper) return;
    try {
      const eyeDropper = new window.EyeDropper();
      const result = await eyeDropper.open();
      onChange(result.sRGBHex);
    } catch (e) {
      // Annulé par l'utilisateur (Échap/clic ailleurs) — rien à faire.
    }
  }

  return (
    <div className="palette-base-row">
      <span className="palette-base-swatch" style={{ background: value }} />
      <span className="palette-base-label">{PALETTE_V2_BASE_LABELS[colorKey]}</span>
      <input
        type="text"
        className="palette-base-hex"
        value={draft}
        onChange={handleTextChange}
        aria-label={`Code hexadécimal — ${PALETTE_V2_BASE_LABELS[colorKey]}`}
        spellCheck={false}
        maxLength={7}
      />
      {window.EyeDropper && (
        <button
          type="button"
          className="palette-base-pipette"
          onClick={handlePipette}
          aria-label={`Choisir ${PALETTE_V2_BASE_LABELS[colorKey]} à la pipette`}
          title="Choisir à la pipette"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              fill="currentColor"
              d="M19.35 4.65a2.24 2.24 0 0 0-3.17 0l-2.1 2.1-.9-.9-1.41 1.41.9.9-7.45 7.45a1 1 0 0 0-.27.5l-.7 3.1a.6.6 0 0 0 .72.72l3.1-.7a1 1 0 0 0 .5-.27l7.45-7.45.9.9 1.41-1.41-.9-.9 2.1-2.1a2.24 2.24 0 0 0 0-3.17z"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

// Éditeur des 8 couleurs de base — affiché uniquement quand le toggle
// "Nouvelle palette (test)" est actif (cf. ConfigModal), puisqu'il pilote
// exactement cette palette-là. `bases`/`onChangeBase`/`onReset` viennent de
// ConfigContext (paletteV2Bases/setPaletteV2Base/resetPaletteV2Bases).
export function PaletteBaseEditor({ bases, onChangeBase, onReset }) {
  return (
    <div className="palette-base-editor">
      <div className="palette-base-editor-head">
        <span>Palette (8 couleurs de base)</span>
        <button type="button" className="link-btn palette-base-reset" onClick={onReset}>
          Réinitialiser
        </button>
      </div>
      {Object.keys(PALETTE_V2_BASE_LABELS).map((key) => (
        <PaletteBaseRow
          key={key}
          colorKey={key}
          value={bases[key]}
          onChange={(hex) => onChangeBase(key, hex)}
        />
      ))}
    </div>
  );
}
