// Icône "déconnexion", servie depuis frontend/public/ (signout.png —
// silhouette sur fond transparent). PAS via mediaUrl/le backend :
// backend/results/ est gitignored et jamais déployé, un chemin mediaUrl()
// y renverrait donc un 404 silencieux en production. Même technique de
// recoloration que GearIcon (mask-image sur le canal alpha du PNG, la
// couleur vient de background) plutôt qu'un filtre, pour rester fidèle à
// `color` quel que soit le contenu du fichier. Gris foncé fixe (pas
// var(--text)) pour rester identique quel que soit le thème, cf. demande
// explicite du user.
export function SignOutIcon({ size = 20, color = "#4b5563" }) {
  const url = "/signout.png";
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
