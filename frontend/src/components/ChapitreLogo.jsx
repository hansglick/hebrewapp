import { useEffect, useState } from "react";
import { useConfig } from "../config/ConfigContext";
import { mediaUrl } from "../api/media";
import { chapitreLogoFile, displayChapitreLabel } from "../utils/chapitreDisplay";

// Cache module-level (par fichier, pas par instance du composant) : les 5
// logos de chapitre sont réutilisés tels quels partout dans l'app, inutile
// de refaire le fetch/parsing à chaque montage.
const svgCache = new Map();

// Seul cub.svg (chapitre גור) est un aplat 2 tons purs (#000000/#ffffff,
// simple trait) : on peut le recolorer proprement en currentColor. Les 4
// autres logos (talmid/bachour/veteran/israeli) sont des illustrations en
// vrais dégradés de gris (des dizaines de teintes distinctes, jamais du
// #000000/#ffffff pur) — les aplatir en une seule teinte détruirait leur
// ombrage. Si aucun élément #ffffff/#000000 n'est trouvé, on considère le
// fichier "non recolorable" et le composant retombe sur l'ancien rendu
// mix-blend-mode (cf. ChapitreLogoBlendMode plus bas) — cf. demande
// explicite du user, constat fait en retestant le raccordement.
function cleanChapitreSvg(raw) {
  const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg) return null;
  const whiteGroups = svg.querySelectorAll('g[fill="#ffffff"]');
  const blackGroups = svg.querySelectorAll('g[fill="#000000"]');
  if (whiteGroups.length === 0 && blackGroups.length === 0) return null;

  blackGroups.forEach((g) => g.setAttribute("fill", "currentColor"));

  // Le groupe blanc ne dessine PAS un simple fond uni : son chemin
  // combine un rectangle englobant (1er sous-chemin, jamais visible —
  // l'ancien hack mix-blend-mode le faisait disparaître) PUIS la
  // silhouette réelle du personnage en creux (2e sous-chemin). Remplir le
  // groupe tel quel colorie donc le rectangle englobant, pas la silhouette
  // — cf. demande explicite du user. On jette le 1er sous-chemin pour ne
  // garder que la silhouette, et on repeint ce groupe AVANT le trait noir
  // (currentColor) pour qu'il reste dessous plutôt que de le recouvrir.
  whiteGroups.forEach((g) => {
    g.setAttribute("fill", "var(--chapitreLogoBg, none)");
    g.querySelectorAll("path").forEach((path) => {
      const d = path.getAttribute("d") || "";
      const subpaths = d.split(/(?<=[Zz])\s*(?=[Mm])/);
      if (subpaths.length <= 1) return;
      // Le 2e sous-chemin (la silhouette) démarre par un "m dx dy" RELATIF
      // — relatif à la position courante au sein du chemin COMPLET (le
      // point de départ du 1er sous-chemin, restauré par son "z"). Isolé
      // tel quel dans un <path> autonome, ce même "m" serait interprété
      // comme absolu (1re commande d'un chemin = toujours absolue), donc
      // mal placé — on le convertit explicitement en "M" absolu à partir
      // du point de départ du chemin d'origine.
      const start = d.match(/^[Mm]\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/);
      const rest = subpaths.slice(1).join(" ");
      const fixed = start
        ? rest.replace(/^m\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/, (_, dx, dy) => {
            const x = parseFloat(start[1]) + parseFloat(dx);
            const y = parseFloat(start[2]) + parseFloat(dy);
            return `M${x} ${y}`;
          })
        : rest;
      path.setAttribute("d", fixed);
    });
    g.parentNode.insertBefore(g, g.parentNode.firstChild);
  });

  return { markup: svg.innerHTML, viewBox: svg.getAttribute("viewBox") };
}

// Ancien rendu (mix-blend-mode + filter:invert selon le thème clair/sombre)
// — conservé comme repli pour les logos aux vrais dégradés de gris, non
// raccordables à la palette sans perte de détail (cf. cleanChapitreSvg).
function ChapitreLogoBlendMode({ file, size, style, rest }) {
  const { themeMode } = useConfig();
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

// Logo accolé au label d'un chapitre — dimensionné en `em` pour rester à
// peine plus grand que la lettre la plus haute du texte à côté duquel il
// s'affiche, quel que soit le contexte (titre, tuile, texte courant...).
//
// `color` : var(--textPrimary) par défaut (théme-adaptif, tous les usages
// hors bandeau) ; le bandeau (fond sombre fixe, cf. Layout.jsx) passe
// explicitement var(--chromeTextPrimary).
// Sentinel distinct de `undefined` (= pas encore chargé) : fichier chargé
// mais pas un aplat 2 tons purs, cf. cleanChapitreSvg.
const UNSUPPORTED = "unsupported";

export function ChapitreLogo({ chapId, size = "4.6em", color, bgColor, style, ...rest }) {
  const file = chapitreLogoFile(chapId);
  const [svgData, setSvgData] = useState(() => (file ? svgCache.get(file) : undefined));

  useEffect(() => {
    if (!file || svgCache.has(file)) return;
    let cancelled = false;
    // cache:"no-store" — sans ça, une entrée du cache HTTP posée par un
    // <img src> précédent sur cette MÊME URL (chargement "simple", sans
    // validation CORS) fait échouer tout fetch() ultérieur en mode "cors"
    // par défaut sur cette URL avec un "Failed to fetch" générique — bug
    // navigateur, reproduit et confirmé cette session (curl OK, CORS OK,
    // mais un fetch() de la même URL déjà chargée via <img> échoue ; un
    // fetch() en cache:"no-store" ou vers une URL jamais vue réussit du
    // premier coup). Cause du blocage rencontré lors de la 1re tentative de
    // ce raccordement, jamais identifiée à l'époque.
    fetch(mediaUrl(`logos/${file}`), { cache: "no-store" })
      .then((res) => res.text())
      .then((raw) => {
        const cleaned = cleanChapitreSvg(raw) ?? UNSUPPORTED;
        svgCache.set(file, cleaned);
        if (!cancelled) setSvgData(cleaned);
      })
      .catch(() => {
        if (!cancelled) setSvgData(UNSUPPORTED);
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  if (!file) return null;

  if (svgData === UNSUPPORTED) {
    return <ChapitreLogoBlendMode file={file} size={size} style={style} rest={rest} />;
  }

  if (!svgData) {
    // Espace réservé le temps du 1er fetch (invisible, pas de saut de mise
    // en page) — les montages suivants retombent directement sur le cache.
    return <span aria-hidden="true" style={{ display: "inline-block", height: size, width: size, ...style }} />;
  }

  const [, , vw, vh] = svgData.viewBox.split(" ").map(Number);
  return (
    <svg
      viewBox={svgData.viewBox}
      role="img"
      aria-label=""
      style={{
        height: size,
        width: `calc(${size} * ${vw} / ${vh})`,
        display: "inline-block",
        verticalAlign: "-0.8em",
        marginInlineStart: "0.0875em",
        color: color ?? "var(--textPrimary)",
        flexShrink: 0,
        ...(bgColor ? { "--chapitreLogoBg": bgColor } : null),
        ...style,
      }}
      dangerouslySetInnerHTML={{ __html: svgData.markup }}
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
