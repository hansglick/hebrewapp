import { FlagFrance, FlagIsrael } from "./flags";

// Mode de langue du prof (évaluation orale), en tête de la conversation : deux
// pastilles rondes, une par drapeau ; celle du mode en cours est deux fois plus
// grosse et recouvre un peu l'autre (cf. demande explicite du user). Un clic
// sur la petite change de mode ; sans onChange, le logo montre seulement la
// langue en cours. hint : la bulle qui l'explique, en fondu ("in") puis en
// disparaissant ("out").
const MODES = [
  ["he", "Hébreu", FlagIsrael],
  ["fr", "Français", FlagFrance],
];

export default function LanguageSwitch({ language, onChange, hint = null }) {
  return (
    <div className="ra-language-mode">
      <div
        className="ra-language"
        role="radiogroup"
        aria-label="Langue du prof"
      >
        {MODES.map(([code, label, Flag]) => (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={language === code}
            className={`ra-language-pill ${language === code ? "ra-language-active" : ""}`}
            disabled={!onChange}
            onClick={() => language !== code && onChange?.(code)}
            title={
              language === code
                ? `Le prof parle ${label.toLowerCase()}`
                : onChange
                  ? `Passer en ${label.toLowerCase()}`
                  : undefined
            }
          >
            <Flag round />
          </button>
        ))}
      </div>
      {hint && (
        <div
          className={`ra-language-hint ra-language-hint-${hint}`}
          role="status"
        >
          Cliquez pour changer le mode du coach
        </div>
      )}
    </div>
  );
}
