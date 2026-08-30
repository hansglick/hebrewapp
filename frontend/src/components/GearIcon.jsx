// Icône "configuration" (engrenage), dessinée à la main — bleu pastel par
// défaut pour rester cohérent avec les autres accents de l'app (ex: icône
// Culture, #a9d6f5).
export function GearIcon({ size = 20, color = "#a9d6f5" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" stroke={color} strokeWidth="1.6" />
      <path
        d="M12 3.5v2.4M12 18.1v2.4M20.5 12h-2.4M5.9 12H3.5M17.66 6.34l-1.7 1.7M8.04 15.96l-1.7 1.7M17.66 17.66l-1.7-1.7M8.04 8.04l-1.7-1.7"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
