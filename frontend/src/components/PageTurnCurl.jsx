// Effet "tourner la page" validé sur le prototype /dev/page-turn-preview
// (cf. demande explicite du user) : la page qui "sort" pivote sur le bord
// gauche ("suivant") ou droit ("précédent") de l'écran, découpée en
// plusieurs bandes verticales superposées — chacune affichant le MÊME
// contenu complet (via `renderPage()`, rogné à sa tranche via clip-path) —
// avec un `transition-delay` croissant selon la distance au bord de pivot.
// Les bandes proches du pivot tournent en avance sur celles du bord
// opposé : ça crée une "vague" de rotation qui balaie la page pendant le
// mouvement (illusion de courbure façon page de magazine qu'on feuillette)
// tout en retombant bien plate une fois l'animation finie (même angle
// final pour toutes les bandes) — cf. demande explicite du user.
//
// `renderPage()` doit rendre le contenu de la page en position absolute
// (inset:0) avec son propre fond et `backfaceVisibility: "hidden"` — ce
// composant ne gère que le pivot/découpage, pas l'habillage de la page.
export const PAGE_TURN_STRIP_COUNT = 10;
export const PAGE_TURN_STRIP_DELAY_MS = 22;
export const PAGE_TURN_FLIP_DURATION_MS = 500;
export const PAGE_TURN_TOTAL_DURATION_MS =
  PAGE_TURN_FLIP_DURATION_MS + (PAGE_TURN_STRIP_COUNT - 1) * PAGE_TURN_STRIP_DELAY_MS;

export function pageTurnAngle(dir) {
  return dir === "next" ? -165 : 165;
}

export function PageTurnCurl({ dir, phase, renderPage }) {
  const origin = dir === "next" ? "left center" : "right center";
  const angle = pageTurnAngle(dir);
  const strips = [];
  for (let i = 0; i < PAGE_TURN_STRIP_COUNT; i++) {
    const left = (i * 100) / PAGE_TURN_STRIP_COUNT;
    const right = 100 - ((i + 1) * 100) / PAGE_TURN_STRIP_COUNT;
    // Distance au pivot en nombre de bandes : pour "suivant" le pivot est
    // le bord gauche (bande 0 = la plus proche), pour "précédent" le bord
    // droit (bande PAGE_TURN_STRIP_COUNT-1 = la plus proche).
    const distanceFromPivot = dir === "next" ? i : PAGE_TURN_STRIP_COUNT - 1 - i;
    strips.push(
      <div
        key={i}
        style={{
          position: "absolute",
          inset: 0,
          clipPath: `inset(0 ${right}% 0 ${left}%)`,
          transformOrigin: origin,
          transform: phase === "animating" ? `rotateY(${angle}deg)` : "rotateY(0deg)",
          transition:
            phase === "animating"
              ? `transform ${PAGE_TURN_FLIP_DURATION_MS}ms ease-in ${distanceFromPivot * PAGE_TURN_STRIP_DELAY_MS}ms`
              : "none",
        }}
      >
        {renderPage()}
      </div>
    );
  }
  return <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d" }}>{strips}</div>;
}
