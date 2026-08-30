// Icône "maison" (accueil), dessinée à la main — remplace le lien texte
// "Accueil" du header. Sur mobile (persistant, cf. Layout.css), le contour
// laisse place à une silhouette pleine colorée (mobileFillColor) plutôt
// qu'un simple contour — bascule pilotée en CSS via .icon-outline/.icon-filled,
// pas en JS, pour rester réactif à un simple redimensionnement de fenêtre.
export function HouseIcon({ size = 20, color = "currentColor", mobileFillColor }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <g className="icon-outline" fill="none">
        <path
          d="M4 11.5L12 4L20 11.5"
          stroke={color}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M6 10V19.5C6 19.78 6.22 20 6.5 20H17.5C17.78 20 18 19.78 18 19.5V10"
          stroke={color}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M10 20V15C10 14.45 10.45 14 11 14H13C13.55 14 14 14.45 14 15V20" stroke={color} strokeWidth="1.6" />
      </g>
      {mobileFillColor && (
        <g className="icon-filled" style={{ display: "none" }}>
          <path
            d="M12 3.2L21 11V20.5C21 20.78 20.78 21 20.5 21H14V15C14 14.45 13.55 14 13 14H11C10.45 14 10 14.45 10 15V21H3.5C3.22 21 3 20.78 3 20.5V11L12 3.2Z"
            fill={mobileFillColor}
          />
        </g>
      )}
    </svg>
  );
}
