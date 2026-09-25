import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { appConfig, computePaletteV2, SKIN_PRESETS } from "./appConfig";

const PALETTE_V2_BASES_KEY = "palette-v2-bases";

// Le skin "Kindle" sert de point de départ par défaut pour la palette
// "Personnalisée" (au lieu de PALETTE_V2_BASE_DEFAULTS) — cf. demande
// explicite du user.
function loadPaletteV2Bases() {
  try {
    const raw = localStorage.getItem(PALETTE_V2_BASES_KEY);
    if (raw) return { ...SKIN_PRESETS.kindle, ...JSON.parse(raw) };
  } catch (e) {}
  return { ...SKIN_PRESETS.kindle };
}

const ConfigContext = createContext(null);

export function ConfigProvider({ children }) {
  const [themeMode, setThemeMode] = useState("light");
  const [fontScale, setFontScale] = useState("medium");
  const [godMode, setGodMode] = useState(() => localStorage.getItem("god-mode") === "true");
  // "each" (défaut, comportement actuel) : chaque réponse notée par Gemini
  // (traduction/oral/rapport) est évaluée immédiatement, le user attend le
  // résultat avant de passer à la suivante. "global" : les réponses sont
  // gardées en local le temps de l'examen, puis évaluées les unes après les
  // autres à la fin (cf. les écrans d'examen). N'affecte jamais le
  // pré-remplissage vocal (OpenAI), toujours immédiat.
  const [evalWaitMode, setEvalWaitMode] = useState(
    () => localStorage.getItem("eval-wait-mode") || "each"
  );
  // Case à cocher indépendante du toggle each/global, propre à l'examen
  // oral (cf. ExamenOralScreen) : quand activée, chaque réponse (orale ou
  // rapport) est envoyée à Gemini en arrière-plan dès l'envoi, sans
  // attendre — le user peut continuer l'examen immédiatement. La réponse
  // est alors verrouillée (non modifiable) dès l'envoi, et le bilan final
  // reste bloqué jusqu'à ce que TOUTES les évaluations soient revenues —
  // cf. demande explicite du user.
  const [oralBackgroundEval, setOralBackgroundEval] = useState(
    () => localStorage.getItem("oral-background-eval") === "true"
  );
  // Skin actif : "default" (palette d'origine), "kindle" (preset figé, cf.
  // appConfig.js::SKIN_PRESETS) ou "custom" (palette V2 éditable une à une,
  // cf. paletteV2Bases ci-dessous) — sélectionnable depuis Configuration,
  // cf. demande explicite du user. N'a d'effet qu'en thème clair (pas de
  // variante sombre définie pour "kindle"/"custom").
  const [skin, setSkin] = useState(
    () => localStorage.getItem("active-skin") || "default"
  );
  // Les 8 couleurs de base de la palette V2 (cf. appConfig.js,
  // PALETTE_V2_BASE_DEFAULTS/computePaletteV2), éditables une à une depuis
  // Configuration (pipette ou champ hexadécimal) — tout le reste de la
  // palette V2 est recalculé à partir d'elles à chaque changement.
  const [paletteV2Bases, setPaletteV2Bases] = useState(loadPaletteV2Bases);

  function setPaletteV2Base(key, hex) {
    setPaletteV2Bases((prev) => ({ ...prev, [key]: hex }));
  }

  function resetPaletteV2Bases() {
    setPaletteV2Bases({ ...SKIN_PRESETS.kindle });
  }

  useEffect(() => {
    localStorage.setItem("god-mode", godMode ? "true" : "false");
  }, [godMode]);

  useEffect(() => {
    localStorage.setItem("eval-wait-mode", evalWaitMode);
  }, [evalWaitMode]);

  useEffect(() => {
    localStorage.setItem("oral-background-eval", oralBackgroundEval ? "true" : "false");
  }, [oralBackgroundEval]);

  useEffect(() => {
    localStorage.setItem("active-skin", skin);
  }, [skin]);

  useEffect(() => {
    try {
      localStorage.setItem(PALETTE_V2_BASES_KEY, JSON.stringify(paletteV2Bases));
    } catch (e) {}
  }, [paletteV2Bases]);

  useEffect(() => {
    const theme =
      themeMode === "light" && skin === "custom"
        ? computePaletteV2(paletteV2Bases)
        : themeMode === "light" && skin === "kindle"
        ? computePaletteV2(SKIN_PRESETS.kindle)
        : appConfig.theme[themeMode];
    const root = document.documentElement;
    Object.entries(theme).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });
    root.style.setProperty("--font-latin", appConfig.fontFamily.latin);
    root.style.setProperty("--font-hebrew", appConfig.fontFamily.hebrew);
    root.style.setProperty("--font-hebrew-biblical", appConfig.fontFamily.hebrewBiblical);
    root.style.setProperty("--font-size-base", `${appConfig.fontSize[fontScale]}px`);
    root.style.setProperty("--font-size-hebrew-large", `${appConfig.fontSize.hebrewLarge}px`);
    root.dataset.theme = themeMode;
  }, [themeMode, fontScale, skin, paletteV2Bases]);

  const value = useMemo(
    () => ({
      themeMode,
      setThemeMode,
      fontScale,
      setFontScale,
      godMode,
      setGodMode,
      evalWaitMode,
      setEvalWaitMode,
      oralBackgroundEval,
      setOralBackgroundEval,
      skin,
      setSkin,
      paletteV2Bases,
      setPaletteV2Base,
      resetPaletteV2Bases,
    }),
    [themeMode, fontScale, godMode, evalWaitMode, oralBackgroundEval, skin, paletteV2Bases]
  );

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error("useConfig must be used within a ConfigProvider");
  return ctx;
}
