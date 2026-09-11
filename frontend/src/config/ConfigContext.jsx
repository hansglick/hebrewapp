import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { appConfig } from "./appConfig";

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
    const theme = appConfig.theme[themeMode];
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
  }, [themeMode, fontScale]);

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
    }),
    [themeMode, fontScale, godMode, evalWaitMode, oralBackgroundEval]
  );

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error("useConfig must be used within a ConfigProvider");
  return ctx;
}
