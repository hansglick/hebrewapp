import { useNavigate } from "react-router-dom";
import { SunIcon, MoonIcon } from "./SunMoonIcons";
import { SignOutIcon } from "./SignOutIcon";
import { DictionaryIcon } from "./DictionaryIcon";
import { PaletteBaseEditor } from "./PaletteBaseEditor";
import "./ConfigModal.css";

export function ConfigModal({
  isOpen,
  onClose,
  themeMode,
  setThemeMode,
  godMode,
  setGodMode,
  paletteV2,
  setPaletteV2,
  paletteV2Bases,
  setPaletteV2Base,
  resetPaletteV2Bases,
  onLogout,
}) {
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
            {/* Sans `color` explicite, retombe sur le rouge par défaut de
                DictionaryIcon — cf. demande explicite du user ("même le
                dictionnaire logo" doit devenir blanc). */}
            <DictionaryIcon size={22} color="var(--chromeTextPrimary)" />
          </button>
        </div>

        <div className="config-modal-row">
          <span>Thème</span>
          <div className="switch-wrap">
            <SunIcon size={14} color={themeMode === "light" ? "var(--chromeTextPrimary)" : "var(--chromeTextSecondary)"} />
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
            <MoonIcon size={14} color={themeMode === "dark" ? "var(--chromeTextPrimary)" : "var(--chromeTextSecondary)"} />
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
            <span style={{ fontSize: "0.75em", fontWeight: 600, color: !godMode ? "var(--chromeTextPrimary)" : "var(--chromeTextSecondary)" }}>
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
            <span style={{ fontSize: "0.75em", fontWeight: 600, color: godMode ? "var(--chromeTextPrimary)" : "var(--chromeTextSecondary)" }}>
              on
            </span>
          </div>
        </div>

        {/* Toggle TEMPORAIRE (cf. appConfig.js::basePaletteLightV2) — pour
            comparer côte à côte l'ancienne et la nouvelle palette
            (regroupement de nuances) avant de trancher. Sans effet en
            thème sombre (aucune variante sombre définie), cf. demande
            explicite du user. À retirer une fois la décision prise. */}
        <div className="config-modal-row">
          <span>Nouvelle palette (test)</span>
          <div className="switch-wrap">
            <span style={{ fontSize: "0.75em", fontWeight: 600, color: !paletteV2 ? "var(--chromeTextPrimary)" : "var(--chromeTextSecondary)" }}>
              off
            </span>
            <button
              type="button"
              className={`switch${paletteV2 ? " on" : ""}`}
              role="switch"
              aria-checked={paletteV2}
              aria-label="Basculer la nouvelle palette (test)"
              onClick={() => setPaletteV2(!paletteV2)}
            >
              <span className="switch-knob" />
            </button>
            <span style={{ fontSize: "0.75em", fontWeight: 600, color: paletteV2 ? "var(--chromeTextPrimary)" : "var(--chromeTextSecondary)" }}>
              on
            </span>
          </div>
        </div>

        {/* Éditeur des 8 couleurs de base — uniquement visible quand la
            palette V2 est active, puisque c'est elle qu'il pilote (cf.
            demande explicite du user, "modifier chacune des valeurs, soit
            à partir d'une pipette, soit à partir d'un champ
            hexadécimal"). */}
        {paletteV2 && (
          <PaletteBaseEditor
            bases={paletteV2Bases}
            onChangeBase={setPaletteV2Base}
            onReset={resetPaletteV2Bases}
          />
        )}

        <div className="config-modal-row">
          <span>Déconnexion</span>
          <button
            type="button"
            className="link-btn"
            style={{ padding: 0 }}
            onClick={onLogout}
            aria-label="Déconnexion"
          >
            {/* Sans `color` explicite, retombe sur un gris fixe (pas même
                un token de thème) — cf. demande explicite du user. */}
            <SignOutIcon size={26} color="var(--chromeTextPrimary)" />
          </button>
        </div>
      </div>
    </div>
  );
}
