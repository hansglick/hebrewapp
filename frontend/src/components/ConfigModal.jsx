import { useNavigate } from "react-router-dom";
import { SunIcon, MoonIcon } from "./SunMoonIcons";
import { SignOutIcon } from "./SignOutIcon";
import { DictionaryIcon } from "./DictionaryIcon";
import "./ConfigModal.css";

export function ConfigModal({ isOpen, onClose, themeMode, setThemeMode, godMode, setGodMode, onLogout }) {
  const navigate = useNavigate();
  if (!isOpen) return null;

  function goToDictionnaire() {
    onClose();
    navigate("/dictionnaire");
  }

  return (
    <div className="config-modal-overlay" onClick={onClose}>
      <div className="config-modal" onClick={(e) => e.stopPropagation()}>
        <div className="config-modal-header">
          <strong>Configuration</strong>
          <button
            type="button"
            className="link-btn"
            style={{ padding: 0, fontSize: "1.1em" }}
            onClick={onClose}
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {/* Dictionnaire : déplacé ici depuis la barre de contrôle
            supérieure sur desktop (remplacée par l'icône Bibliothèque,
            cf. Layout.jsx) — cf. demande explicite du user. */}
        <div className="config-modal-row">
          <span>Dictionnaire</span>
          <button
            type="button"
            className="link-btn"
            style={{ padding: 0 }}
            onClick={goToDictionnaire}
            aria-label="Dictionnaire"
          >
            <DictionaryIcon size={22} />
          </button>
        </div>

        <div className="config-modal-row">
          <span>Thème</span>
          <div className="switch-wrap">
            <SunIcon size={14} color={themeMode === "light" ? "var(--textPrimary)" : "var(--textSecondary)"} />
            <button
              type="button"
              className={`switch${themeMode === "dark" ? " on" : ""}`}
              role="switch"
              aria-checked={themeMode === "dark"}
              aria-label="Basculer clair / sombre"
              onClick={() => setThemeMode(themeMode === "light" ? "dark" : "light")}
            >
              <span className="switch-knob" />
            </button>
            <MoonIcon size={14} color={themeMode === "dark" ? "var(--textPrimary)" : "var(--textSecondary)"} />
          </div>
        </div>

        {/* God Mode : débloque toutes les leçons/examens (cf. usages de
            godMode dans LeconsListScreen/ConversationLeconsListScreen/
            ConversationProfLeconsListScreen/ExamenCibleScreen), off par
            défaut — cf. demande explicite du user. */}
        <div className="config-modal-row">
          <span>God Mode</span>
          {/* "off"/"on" de part et d'autre du loquet — même couleur/format
              que le toggle Thème ci-dessus (côté actif en textPrimary,
              côté inactif en textSecondary, dans un .switch-wrap) — cf.
              demande explicite du user. */}
          <div className="switch-wrap">
            <span style={{ fontSize: "0.75em", fontWeight: 600, color: !godMode ? "var(--textPrimary)" : "var(--textSecondary)" }}>
              off
            </span>
            <button
              type="button"
              className={`switch${godMode ? " on" : ""}`}
              role="switch"
              aria-checked={godMode}
              aria-label="Basculer God Mode"
              onClick={() => setGodMode(!godMode)}
            >
              <span className="switch-knob" />
            </button>
            <span style={{ fontSize: "0.75em", fontWeight: 600, color: godMode ? "var(--textPrimary)" : "var(--textSecondary)" }}>
              on
            </span>
          </div>
        </div>

        <div className="config-modal-row">
          <span>Déconnexion</span>
          <button
            type="button"
            className="link-btn"
            style={{ padding: 0 }}
            onClick={onLogout}
            aria-label="Déconnexion"
          >
            <SignOutIcon size={26} />
          </button>
        </div>
      </div>
    </div>
  );
}
