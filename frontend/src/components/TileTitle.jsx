import { MaskIcon } from "./MaskIcon";

// Icône sobre à l'extrémité gauche du titre d'une tuile (cf. Accueil.jsx,
// d'où ce composant a été extrait pour être réutilisé sur d'autres écrans
// de tuiles — cf. demande explicite du user). gap:14 (pas 8) : le
// transform:scale(1.5) du logo déborde de ~5.5px sur sa droite (sa boîte de
// mise en page reste 22px, mesurée par ce gap, alors que son rendu visuel
// fait 33px) — sans ce +6px, le logo grossi mordait visuellement sur
// l'espace vers le titre.
// gap par défaut (14) inchangé pour l'accueil ; les tuiles des autres
// écrans (leçon/parler/révision), plus étroites (largeur au contenu, pas
// alignées entre elles comme sur l'accueil), paraissaient trop collées
// logo/texte une fois justifiées à gauche — cf. demande explicite du user.
export function TileTitle({ src, color, children, gap = 14 }) {
  return (
    // justifyContent:"flex-start" (pas "center") : le logo + titre doivent
    // toujours être justifiés à gauche de la tuile — cf. demande explicite
    // du user. Ce div occupe déjà toute la largeur de la tuile (display:
    // flex en block, sans width propre), donc ce seul changement suffit.
    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap }}>
      {/* transform:scale (pas size) : agrandit le logo de 50% sans toucher
          à sa boîte de mise en page (22px), donc sans changer la hauteur
          de la ligne ni la dimension de la tuile. */}
      <MaskIcon src={src} size={22} color={color} style={{ transform: "scale(1.5)" }} />
      <span style={{ fontWeight: 600, fontSize: "1.1em" }}>{children}</span>
    </div>
  );
}
