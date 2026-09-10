// Remplace point-dinterrogation.png (cercle + "?" figé en noir) par un SVG
// dessiné à la main, pour pouvoir en fixer la couleur de fond — cf.
// demande explicite du user (fond = couleur du mot hébreu du bloc 1).
export function QuestionMarkIcon({ size = 36, background = "#000", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={style}>
      <circle cx="12" cy="12" r="12" fill={background} />
      <text x="12" y="16.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff" fontFamily="sans-serif">
        ?
      </text>
    </svg>
  );
}
