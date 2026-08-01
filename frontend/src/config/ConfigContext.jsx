import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { appConfig } from "./appConfig";

const ConfigContext = createContext(null);

export function ConfigProvider({ children }) {
  const [themeMode, setThemeMode] = useState("light");
  const [fontScale, setFontScale] = useState("medium");

  useEffect(() => {
    const theme = appConfig.theme[themeMode];
    const root = document.documentElement;
    Object.entries(theme).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });
    root.style.setProperty("--font-latin", appConfig.fontFamily.latin);
    root.style.setProperty("--font-hebrew", appConfig.fontFamily.hebrew);
    root.style.setProperty("--font-size-base", `${appConfig.fontSize[fontScale]}px`);
    root.style.setProperty("--font-size-hebrew-large", `${appConfig.fontSize.hebrewLarge}px`);
    root.dataset.theme = themeMode;
  }, [themeMode, fontScale]);

  const value = useMemo(
    () => ({ themeMode, setThemeMode, fontScale, setFontScale }),
    [themeMode, fontScale]
  );

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error("useConfig must be used within a ConfigProvider");
  return ctx;
}
