// Emoji drapeaux (🇮🇱/🇫🇷) rendus en "IL"/"FR" sous Windows (police système sans
// glyphes drapeaux) — remplacés par de petits SVG dessinés à la main, fiables
// sur toute plateforme.
export function FlagIsrael({ size = 30 }) {
  return (
    <svg width={size} height={(size * 2) / 3} viewBox="0 0 30 20" aria-hidden="true">
      <rect width="30" height="20" fill="#ffffff" />
      <rect width="30" height="2.5" y="2" fill="#0038b8" />
      <rect width="30" height="2.5" y="15.5" fill="#0038b8" />
      <polygon points="15,6 18.5,12 11.5,12" fill="none" stroke="#0038b8" strokeWidth="1" />
      <polygon points="15,14 18.5,8 11.5,8" fill="none" stroke="#0038b8" strokeWidth="1" />
    </svg>
  );
}

export function FlagFrance({ size = 30 }) {
  return (
    <svg width={size} height={(size * 2) / 3} viewBox="0 0 30 20" aria-hidden="true">
      <rect width="10" height="20" x="0" fill="#0055a4" />
      <rect width="10" height="20" x="10" fill="#ffffff" />
      <rect width="10" height="20" x="20" fill="#ef4135" />
    </svg>
  );
}
