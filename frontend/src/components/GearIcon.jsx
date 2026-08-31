import { mediaUrl } from "../api/media";

// Icône "configuration" (engrenage), fournie par l'utilisateur
// (backend/results/logos/configuration.png — silhouette noire sur fond
// transparent). Recolorée via mask-image plutôt qu'un filtre : le PNG sert
// uniquement de forme (son canal alpha), la couleur vient de background,
// donc `color` s'applique fidèlement quel que soit le contenu du fichier.
// Même bleu que ShekelIcon (var(--shekel)) par défaut, pour rester cohérent
// entre les deux icônes du bandeau supérieur.
export function GearIcon({ size = 20, color = "var(--shekel)" }) {
  const url = mediaUrl("logos/configuration.png");
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
