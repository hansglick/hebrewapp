import { SunIcon, MoonIcon } from "./SunMoonIcons";
import { SignOutIcon } from "./SignOutIcon";
import "./ConfigModal.css";

export function ConfigModal({ isOpen, onClose, themeMode, setThemeMode, onLogout }) {
  if (!isOpen) return null;
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

        <div className="config-modal-row">
          <span>Thème</span>
          <div className="switch-wrap">
            <SunIcon size={14} color={themeMode === "light" ? "var(--text)" : "var(--textMuted)"} />
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
            <MoonIcon size={14} color={themeMode === "dark" ? "var(--text)" : "var(--textMuted)"} />
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
