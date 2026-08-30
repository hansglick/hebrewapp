// Icône "dictionnaire" (livre ouvert), dessinée à la main plutôt qu'un emoji
// 📕 coloré (même piège de rendu que ConfigIcon/SpeakerIcon) — rouge par
// défaut, cf. demande explicite du user ("logo rouge").
export function DictionaryIcon({ size = 20, color = "var(--danger)" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 6C10.5 4.8 8.4 4 5.5 4C4.67 4 4 4.67 4 5.5V17C4 17.83 4.67 18.5 5.5 18.5C8.4 18.5 10.5 19.3 12 20.5"
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 6C13.5 4.8 15.6 4 18.5 4C19.33 4 20 4.67 20 5.5V17C20 17.83 19.33 18.5 18.5 18.5C15.6 18.5 13.5 19.3 12 20.5"
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="12" y1="6" x2="12" y2="20.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
