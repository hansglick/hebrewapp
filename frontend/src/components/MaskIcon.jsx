// Icône générique recolorée via mask-image (cf. GearIcon/SignOutIcon) : le
// PNG (silhouette noire sur fond transparent, servi depuis frontend/public/
// — jamais via mediaUrl/le backend, cf. GearIcon) ne sert que de forme, la
// couleur vient de `color` et suit donc fidèlement le thème courant.
export function MaskIcon({ src, size = 20, color = "var(--text)", style }) {
  return (
    <span
      role="img"
      aria-hidden="true"
      style={{
        display: "inline-block",
        flexShrink: 0,
        width: size,
        height: size,
        backgroundColor: color,
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        ...style,
      }}
    />
  );
}
