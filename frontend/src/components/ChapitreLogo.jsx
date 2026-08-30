import { mediaUrl } from "../api/media";
import { chapitreLogoFile, displayChapitreLabel } from "../utils/chapitreDisplay";
import { useConfig } from "../config/ConfigContext";

// Logo accolé au label d'un chapitre — dimensionné en `em` pour rester à
// peine plus grand que la lettre la plus haute du texte à côté duquel il
// s'affiche, quel que soit le contexte (titre, tuile, texte courant...).
export function ChapitreLogo({ chapId, size = "4.6em", style, ...rest }) {
  const { themeMode } = useConfig();
  const file = chapitreLogoFile(chapId);
  if (!file) return null;
  // Le SVG source dessine un aplat blanc plein cadre derrière l'icône (pas
  // une vraie zone transparente) et un trait noir. En light mode, multiply
  // fait disparaître le blanc (blanc × fond = fond) et laisse le noir
  // intact. En dark mode ce même noir resterait noir sur fond sombre
  // (quasi invisible) : on inverse d'abord les couleurs (blanc<->noir) puis
  // on blend en screen, qui fait disparaître le nouveau noir (l'ex-blanc,
  // devenu 0 × fond via screen = fond) et rend le trait (ex-noir, devenu
  // blanc) opaque quel que soit le fond.
  const isDark = themeMode === "dark";
  return (
    <img
      src={mediaUrl(`logos/${file}`)}
      alt=""
      style={{
        height: size,
        width: "auto",
        display: "inline-block",
        verticalAlign: "-0.8em",
        marginInlineStart: "0.0875em",
        filter: isDark ? "invert(1)" : undefined,
        mixBlendMode: isDark ? "screen" : "multiply",
        ...style,
      }}
      {...rest}
    />
  );
}

// Logo au-dessus, label centré en dessous — pour les écrans où le label
// d'un chapitre s'affiche accompagné de son logo (liste des chapitres,
// titre de la liste des leçons, choix de chapitre pour l'équivalence).
export function ChapitreLabelWithLogo({ chapId, size }) {
  return (
    <span
      style={{
        display: "flex",
        width: "100%",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.0109375em",
      }}
    >
      <ChapitreLogo chapId={chapId} size={size} style={{ marginInlineStart: 0 }} />
      <span>{displayChapitreLabel(chapId)}</span>
    </span>
  );
}
