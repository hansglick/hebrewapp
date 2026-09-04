// Fichier de configuration graphique — modifiable à la main sans repasser par du code applicatif.

export const appConfig = {
  theme: {
    light: {
      bg: "#ffffff",
      surface: "#f4f3ec",
      text: "#1a1a1a",
      textMuted: "#6b6375",
      accent: "#2f6f4f",
      border: "#e5e4e7",
      success: "#2f9e44",
      successLight: "#b2f2bb",
      danger: "#e03131",
      warning: "#f08c00",
      shekel: "#1d3557",
    },
    dark: {
      bg: "#16171d",
      surface: "#1f2028",
      text: "#f3f4f6",
      textMuted: "#9ca3af",
      accent: "#5fbf8b",
      border: "#2e303a",
      success: "#40c057",
      successLight: "#69db7c",
      danger: "#ff6b6b",
      warning: "#ffa94d",
      shekel: "#7dd3fc",
    },
  },
  fontFamily: {
    latin: "system-ui, 'Segoe UI', Roboto, sans-serif",
    hebrew: "'Arial Hebrew', 'Noto Sans Hebrew', system-ui, sans-serif",
    hebrewBiblical: "'Frank Ruhl Libre', 'Times New Roman', serif",
  },
  fontSize: {
    small: 14,
    medium: 18,
    large: 24,
    hebrewLarge: 34,
  },
};
