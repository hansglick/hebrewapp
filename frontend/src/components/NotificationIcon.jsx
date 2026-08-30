// Icône "notifications" (enveloppe), dessinée à la main plutôt qu'un emoji
// coloré (même piège de rendu que ConfigIcon/DictionaryIcon/SpeakerIcon).
export function NotificationIcon({ size = 20, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke={color} strokeWidth="1.6" />
      <path d="M3.5 6L12 13L20.5 6" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
