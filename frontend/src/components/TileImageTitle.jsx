// Comme TileTitle, mais <img> plutôt que MaskIcon : pour les logos fournis
// en couleur, que le masque CSS de recolorisation aplatirait en un bloc uni.
// Même boîte 22px + transform:scale(1.5) (rendu 33px) + gap:20 que TileTitle
// par défaut ; `scale` permet d'agrandir le rendu au cas par cas. Comme le
// transform ne change pas la boîte de mise en page (22px), un scale plus
// grand déborde davantage vers le texte — on compense en augmentant le gap
// du même débordement supplémentaire, pour garder un espacement visuel
// constant quel que soit le scale.
export function TileImageTitle({ src, children, scale = 1.5 }) {
  const gap = 20 + Math.max(0, 11 * (scale - 1.5));
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap }}>
      <img
        src={src}
        alt=""
        style={{ width: 22, height: 22, flexShrink: 0, objectFit: "contain", transform: `scale(${scale})` }}
      />
      <span style={{ fontWeight: 600, fontSize: "1.1em" }}>{children}</span>
    </div>
  );
}
