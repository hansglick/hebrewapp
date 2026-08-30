// Icônes soleil/lune dessinées à la main (pas d'emoji couleur ☀️/🌙, même
// piège que SpeakerIcon) pour le loquet clair/sombre de la configuration.
export function SunIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill={color} />
      <g stroke={color} strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="1.5" x2="12" y2="4" />
        <line x1="12" y1="20" x2="12" y2="22.5" />
        <line x1="1.5" y1="12" x2="4" y2="12" />
        <line x1="20" y1="12" x2="22.5" y2="12" />
        <line x1="4.6" y1="4.6" x2="6.3" y2="6.3" />
        <line x1="17.7" y1="17.7" x2="19.4" y2="19.4" />
        <line x1="4.6" y1="19.4" x2="6.3" y2="17.7" />
        <line x1="17.7" y1="6.3" x2="19.4" y2="4.6" />
      </g>
    </svg>
  );
}

export function MoonIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M20.5 15.3A9 9 0 0 1 8.7 3.5a9 9 0 1 0 11.8 11.8z" />
    </svg>
  );
}
