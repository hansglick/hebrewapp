// Icône "configuration" (engrenage), servie depuis frontend/public/
// (configuration.png — silhouette noire sur fond transparent). PAS via
// mediaUrl/le backend : backend/results/ est gitignored et jamais déployé,
// un chemin mediaUrl() y renverrait donc un 404 silencieux en production.
// Recolorée via mask-image plutôt qu'un filtre : le PNG sert uniquement de
// forme (son canal alpha), la couleur vient de background, donc `color`
// s'applique fidèlement quel que soit le contenu du fichier. #7dd3fc = même
// bleu pastel que ShekelIcon/MagenDavidIcon dans le bandeau supérieur
// (Layout.jsx les fixe en dur à cette couleur, PAS var(--shekel) qui elle
// varie avec le thème — donc pas la bonne référence ici).
export function GearIcon({ size = 20, color = "#7dd3fc" }) {
  const url = "/configuration.png";
  return (
    <span
      role="img"
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        backgroundColor: color,
        WebkitMaskImage: `url(${url})`,
        maskImage: `url(${url})`,
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
