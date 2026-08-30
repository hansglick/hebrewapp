// Icône "réglages" (curseurs horizontaux) — n'apparaît que sur mobile quand
// l'espace manque, pour révéler les logos secondaires (compteurs,
// notifications, dictionnaire, toggle thème) dans un panneau déroulant.
export function MobileMenuIcon({ size = 20, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <line x1="4" y1="7" x2="20" y2="7" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="9" cy="7" r="2.2" fill={color} />
      <line x1="4" y1="12" x2="20" y2="12" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="16" cy="12" r="2.2" fill={color} />
      <line x1="4" y1="17" x2="20" y2="17" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="11" cy="17" r="2.2" fill={color} />
    </svg>
  );
}
