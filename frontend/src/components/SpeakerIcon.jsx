// Les emoji couleur (🔊) ignorent la propriété CSS `color` — remplacé par un
// SVG dessiné à la main pour pouvoir en fixer la couleur (ex: noir).
export function SpeakerIcon({ size = 18, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M4 9v6h4l5 5V4L8 9H4z" />
      <path d="M16.5 12c0-1.77-1-3.29-2.5-4.03v8.06c1.5-.74 2.5-2.26 2.5-4.03z" />
      <path d="M19 12c0-3.53-2-6.58-5-8.11v1.87c2 .82 3.5 3.03 3.5 6.24s-1.5 5.42-3.5 6.24v1.87c3-1.53 5-4.58 5-8.11z" />
    </svg>
  );
}
