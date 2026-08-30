// Icône "Culture" (accès à l'écran Fun) — dreidel.png (backend/results/logos)
// est une silhouette monochrome avec un vrai canal alpha : on la recolore
// dynamiquement via un masque CSS plutôt que d'utiliser <img>, pour qu'elle
// suive automatiquement le thème (var(--text)) en light comme en dark,
// quelle que soit la couleur d'origine du fichier.
export function DreidelIcon({ size = 20, color = "var(--text)" }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        backgroundColor: color,
        WebkitMaskImage: "url(/dreidel.png)",
        maskImage: "url(/dreidel.png)",
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
