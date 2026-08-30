// Étoile de David (deux triangles superposés) — remplace l'emoji 🃏 pour le
// compteur de cartes du wallet-strip.
export function MagenDavidIcon({ size = 20, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2 L21.2 18 H2.8 Z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12 22 L2.8 6 H21.2 Z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
