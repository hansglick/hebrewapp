import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getNiveau } from "../api/user";
import { getOnboardingStatus } from "../api/onboarding";
import { ChapitreLogo } from "../components/ChapitreLogo";
import { TileTitle } from "../components/TileTitle";
import { displayChapitreLabel } from "../utils/chapitreDisplay";
import { displayLessonNumber } from "../utils/lessonDisplay";
import "./screens.css";

// Hauteur explicite partagée par les tuiles "Examen" et "Examen Blanc" —
// pour rester strictement identique entre les deux quelle que soit la
// longueur du texte ("Examen" vs "Examen Blanc"), cf. demande explicite du
// user. Valeur alignée sur la hauteur naturelle d'une tuile TileTitle
// simple (padding:12px 14px de .card + une ligne de contenu ~24px + les
// bordures), comme "Parler"/"Apprendre" plus haut.
const EXAM_TILE_HEIGHT = 50;

export default function Accueil() {
  const [niveau, setNiveau] = useState(null);
  const [pseudo, setPseudo] = useState(null);
  const titleRef = useRef(null);

  useEffect(() => {
    getNiveau().then(setNiveau);
    getOnboardingStatus().then((s) => setPseudo(s.pseudo));
  }, []);

  // Centre le titre "שלום {pseudo}" verticalement dans l'espace entre le
  // bas du bandeau et la première tuile — cf. demande explicite du user.
  // marginTop calculé dynamiquement (pas une valeur fixe) : ce titre est
  // le premier enfant d'un conteneur flex "safe center" (cf. .screen,
  // screens.css), où un marginTop sur le 1er enfant ne déplace celui-ci
  // que de la MOITIÉ de sa valeur (le recentrage absorbe l'autre moitié —
  // cf. memory safe_center_first_child_margin_pitfall). Plutôt que de
  // supposer ce facteur 0.5 en dur, on le mesure ici : un déplacement
  // d'essai donne le déplacement réel obtenu, d'où l'on déduit la pente
  // exacte puis la valeur à poser pour centrer pile — robuste quelle que
  // soit la taille de fenêtre, recalculé au resize.
  useLayoutEffect(() => {
    if (!pseudo) return;
    const el = titleRef.current;
    const header = document.querySelector(".app-header");
    const firstTile = document.querySelector(".accueil-columns");
    if (!el || !header || !firstTile) return;

    function centerOf(rect) {
      return rect.top + rect.height / 2;
    }
    function targetCenter() {
      return (header.getBoundingClientRect().bottom + firstTile.getBoundingClientRect().top) / 2;
    }

    function apply() {
      el.style.marginTop = "0px";
      const c0 = centerOf(el.getBoundingClientRect());
      const target = targetCenter();
      const rawDelta = target - c0;
      if (Math.abs(rawDelta) < 0.5) return; // déjà centré, rien à faire

      const testMargin = 40;
      el.style.marginTop = testMargin + "px";
      const c1 = centerOf(el.getBoundingClientRect());
      const slope = (c1 - c0) / testMargin;
      if (!slope) {
        el.style.marginTop = "0px";
        return;
      }
      const neededMargin = rawDelta / slope;
      el.style.marginTop = `${neededMargin}px`;

      // Garde-fou : si le résultat déborde au-dessus du bandeau ou pousse
      // le titre sous la première tuile (mesure incohérente, contenu
      // transitoire...), revenir à la position naturelle plutôt que
      // d'afficher quelque chose de cassé.
      const finalRect = el.getBoundingClientRect();
      if (finalRect.top < header.getBoundingClientRect().bottom || finalRect.bottom > firstTile.getBoundingClientRect().top) {
        el.style.marginTop = "0px";
      }
    }

    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [pseudo, niveau]);

  // Desktop UNIQUEMENT (même seuil que .accueil-columns, screens.css) :
  // toutes les colonnes prennent la même largeur que "Apprendre" (la
  // première), plutôt que leur largeur naturelle propre à leur texte — cf.
  // demande explicite du user. Sur mobile (.accueil-columns empilé en
  // colonne), on retire l'override pour retrouver la largeur pleine
  // habituelle de chaque tuile.
  useLayoutEffect(() => {
    function apply() {
      const columns = [...document.querySelectorAll(".accueil-columns > .tile-list")];
      if (columns.length < 2) return;
      const isDesktop = window.matchMedia("(min-width: 601px)").matches;
      if (!isDesktop) {
        columns.forEach((el) => {
          el.style.width = "";
          el.style.flexShrink = "";
        });
        return;
      }
      // .tile-list a width:100% en CSS (screens.css) : en tant qu'enfant
      // flex, ça lui donne une base de calcul énorme (100% du conteneur),
      // que le navigateur ne réduit ensuite QUE jusqu'au min-content de
      // CHAQUE colonne (jamais en dessous) — d'où les largeurs toutes
      // différentes constatées avant ce fix. On neutralise donc d'abord ce
      // width:100% (width:"auto", flexShrink:0) sur les 4 colonnes pour
      // mesurer la largeur naturelle réelle de "Apprendre", puis on
      // l'applique aux 3 autres (et on la fige aussi sur "Apprendre" lui-
      // même, pour qu'aucune des 4 ne varie plus au fil des reflows
      // suivants) — cf. demande explicite du user.
      columns.forEach((el) => {
        el.style.width = "auto";
        el.style.flexShrink = "0";
      });
      const width = columns[0].getBoundingClientRect().width;
      columns.forEach((el) => {
        el.style.width = `${width}px`;
      });
    }
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [niveau]);

  // Toutes les tuiles (desktop ET mobile, pas de condition d'écran ici,
  // contrairement à la largeur ci-dessus) prennent la même hauteur que la
  // première ("Apprendre") — cf. demande explicite du user. Neutralise
  // d'abord toute hauteur déjà posée (dont EXAM_TILE_HEIGHT ci-dessus, qui
  // ne visait qu'à égaler "Examen"/"Examen Blanc" entre elles) pour mesurer
  // la hauteur naturelle de référence, puis l'applique à toutes + centre
  // leur contenu verticalement (flex) pour absorber les tuiles dont le
  // contenu est naturellement plus haut ou plus bas.
  useLayoutEffect(() => {
    function apply() {
      const cards = [...document.querySelectorAll(".accueil-columns .card")];
      if (cards.length < 2) return;
      cards.forEach((el) => {
        el.style.height = "";
        el.style.display = "";
        el.style.alignItems = "";
        el.style.justifyContent = "";
      });
      const height = cards[0].getBoundingClientRect().height;
      cards.forEach((el) => {
        el.style.height = `${height}px`;
        el.style.display = "flex";
        el.style.alignItems = "center";
        el.style.justifyContent = "center";
      });
    }
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [niveau]);

  if (!niveau) return null;

  const referenceLesson = niveau.reference_lesson;
  const chapId = referenceLesson ? referenceLesson.split(".")[0] : null;

  return (
    <section className="screen accueil-screen">
      {pseudo && (
        <h1
          ref={titleRef}
          className="hebrew"
          style={{ margin: "0 0 8px", direction: "rtl", fontWeight: 400, fontSize: "2.5em" }}
        >
          {/* "!" placé APRÈS {pseudo} dans l'ordre logique du code : le
              titre est en RTL (direction:"rtl"), donc le contenu le plus
              tardif dans l'ordre logique s'affiche le plus à GAUCHE
              visuellement — cf. demande explicite du user. */}
          שלום <span style={{ fontWeight: 700 }}>{pseudo}</span> !
        </h1>
      )}

      {/* Police nettement plus petite que le titre (0.85em contre ~2em par
          défaut pour un h1) et grise — cf. demande explicite du user.
          marginTop:-12 : le gap:16 du flex .screen + le marginBottom:8 du
          titre donnaient 24px d'écart ; -12px ramène ce total à 12px, soit
          -50% — cf. demande explicite du user. Logo +100% (18px -> 36px) ;
          label du chapitre + index de leçon en gras — cf. demande explicite
          du user. */}
      {referenceLesson && (
        <p
          className="muted"
          style={{
            margin: "-12px 0 8px",
            fontSize: "0.85em",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          Tu es à la leçon{" "}
          <strong style={{ fontWeight: 700 }}>
            {displayChapitreLabel(chapId)}.{displayLessonNumber(referenceLesson)}
          </strong>
          {/* marginInlineStart:-20 : -4 annule le gap:4 du flex parent
              (hérité de tous les enfants) ; les -16px supplémentaires
              compensent la marge transparente interne au SVG (le dessin de
              l'ourson n'occupe pas toute la largeur du cadre 2816x1572 du
              fichier), sans quoi un espace visible restait malgré le
              collage des boîtes DOM — mesuré via Claude in Chrome — cf.
              demande explicite du user ("rapprocher le logo de l'index de
              leçon"). */}
          <ChapitreLogo chapId={chapId} size="36px" style={{ marginInlineStart: -20 }} />
        </p>
      )}

      {/* Linéaire sur une même ligne horizontale en desktop, empilé
          verticalement en mobile (cf. .accueil-columns, screens.css) — 4
          colonnes : Apprendre / Parler / Réviser / Examen, cf. demande
          explicite du user. */}
      <div className="accueil-columns">
        {/* Apprendre — plus de logo de chapitre ni d'index de leçon sur la
            tuile (déplacés sous le titre de l'écran, cf. plus haut), tuile
            simplifiée au même format que Parler/Renforcer — cf. demande
            explicite du user. */}
        <div className="tile-list" style={{ gap: 8, margin: 0 }}>
          {referenceLesson && (
            <Link to={`/apprentissage/${chapId}/${referenceLesson}`} className="card-link">
              <div className="card" style={{ textAlign: "center" }}>
                <TileTitle src="/openbook.png">Apprendre</TileTitle>
              </div>
            </Link>
          )}
        </div>

        {/* Parler (remplace les anciennes tuiles Conversation / Révise avec
            ton professeur, désormais regroupées derrière ce choix, cf.
            ParlerScreen). */}
        <div className="tile-list" style={{ gap: 8, margin: 0 }}>
          <Link to="/parler" className="card-link">
            <div className="card" style={{ textAlign: "center" }}>
              {/* Étoile dorée, coin haut droit — cf. demande explicite du
                  user. .card a déjà position:relative (screens.css), donc
                  ce badge se positionne par rapport à la tuile elle-même. */}
              <svg
                viewBox="0 0 20 20"
                width={20}
                height={20}
                style={{ position: "absolute", top: -8, right: -8 }}
              >
                <polygon
                  points="10,1 12.9,7.6 20,8.1 14.5,12.9 16.2,20 10,16.2 3.8,20 5.5,12.9 0,8.1 7.1,7.6"
                  fill="var(--accueilStarBg)"
                />
              </svg>
              <TileTitle src="/speak.png">Parler</TileTitle>
            </div>
          </Link>
        </div>

        {/* Renforcer (anciennement "Réviser", cf. demande explicite du
            user) */}
        <div className="tile-list" style={{ gap: 8, margin: 0 }}>
          <Link to="/revisions" className="card-link">
            <div className="card" style={{ textAlign: "center" }}>
              <div style={{ marginBottom: 10 }}>
                <TileTitle src="/revision.png">Renforcer</TileTitle>
              </div>
            </div>
          </Link>
        </div>

        {/* Examen Blanc + Examen : empilées verticalement dans la même
            colonne, chacune gardant sa propre tuile pleine (.card /
            .card-dark complète, bordure/coins/ombre intacts) — cf. demande
            explicite du user. gap:16 (comme .accueil-columns, l'écart entre
            "Apprendre" et "Parler") au lieu de 8 — cf. demande explicite du
            user. */}
        <div className="tile-list" style={{ gap: 16, margin: 0 }}>
          <Link to="/examen-blanc" className="card-link">
            <div
              className="card"
              style={{ textAlign: "center", height: EXAM_TILE_HEIGHT, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <TileTitle src="/examhat.png">Examen Blanc</TileTitle>
            </div>
          </Link>

          {niveau.next_lesson_code ? (
            <Link to={`/examen/cible/${niveau.next_lesson_code}`} className="card-link">
              <div
                className="card card-dark"
                style={{ textAlign: "center", height: EXAM_TILE_HEIGHT, display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <TileTitle src="/examhat.png" color="#fff">Examen</TileTitle>
              </div>
            </Link>
          ) : (
            <div className="card" style={{ textAlign: "center", opacity: 0.5 }}>
              Dernier niveau du cours atteint
            </div>
          )}
        </div>
      </div>

    </section>
  );
}
