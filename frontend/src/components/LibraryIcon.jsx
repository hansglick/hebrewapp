// Icône "Bibliothèque" (accès aux leçons précédentes, écran desktop
// uniquement) — library.png (backend/results/logos) est une silhouette
// monochrome avec un vrai canal alpha : on la recolore dynamiquement via un
// masque CSS plutôt que d'utiliser <img>, même technique que DreidelIcon.
export function LibraryIcon({ size = 20, color = "var(--textPrimary)" }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        backgroundColor: color,
        WebkitMaskImage: "url(/library.png)",
        maskImage: "url(/library.png)",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}
