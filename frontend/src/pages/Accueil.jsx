import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getNiveau } from "../api/user";
import { getOnboardingStatus } from "../api/onboarding";
import { MaskIcon } from "../components/MaskIcon";
import { ChapitreLogo } from "../components/ChapitreLogo";
import { displayLessonNumber } from "../utils/lessonDisplay";
import "./screens.css";

// Icône sobre à l'extrémité gauche du titre de chaque tuile (pas de débord
// ni de pulsation, contrairement aux tuiles d'attente d'examen — une tuile
// d'accueil est utilisée en permanence, cf. demande explicite du user). Le
// reste du contenu de la tuile (sous ce titre) reste centré comme avant.
// Hauteur explicite partagée par les tuiles "Examen" et "Examen Blanc" —
// pour rester strictement identique entre les deux quelle que soit la
// longueur du texte ("Examen" vs "Examen Blanc"), cf. demande explicite du
// user. Valeur alignée sur la hauteur naturelle d'une tuile TileTitle
// simple (padding:12px 14px de .card + une ligne de contenu ~24px + les
// bordures), comme "Parler"/"Apprendre" plus haut.
const EXAM_TILE_HEIGHT = 50;

function TileTitle({ src, color, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
      <MaskIcon src={src} size={22} color={color} />
      <span style={{ fontWeight: 600, fontSize: "1.1em" }}>{children}</span>
    </div>
  );
}

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

  if (!niveau) return null;

  const referenceLesson = niveau.reference_lesson;
  const chapId = referenceLesson ? referenceLesson.split(".")[0] : null;

  return (
    <section className="screen accueil-screen">
      {pseudo && (
        <h1 ref={titleRef} className="hebrew" style={{ margin: "0 0 8px", direction: "rtl", fontWeight: 400 }}>
          {/* "!" placé APRÈS {pseudo} dans l'ordre logique du code : le
              titre est en RTL (direction:"rtl"), donc le contenu le plus
              tardif dans l'ordre logique s'affiche le plus à GAUCHE
              visuellement — cf. demande explicite du user. */}
          שלום <span style={{ fontWeight: 700 }}>{pseudo}</span> !
        </h1>
      )}

      {/* Linéaire sur une même ligne horizontale en desktop, empilé
          verticalement en mobile (cf. .accueil-columns, screens.css) — 4
          colonnes : Apprendre / Parler / Réviser / Examen, cf. demande
          explicite du user. */}
      <div className="accueil-columns">
        {/* Apprendre */}
        <div className="tile-list" style={{ gap: 8, margin: 0 }}>
          {referenceLesson && (
            <Link to={`/apprentissage/${chapId}/${referenceLesson}`} className="card-link">
              <div className="card" style={{ textAlign: "center" }}>
                {/* Titre custom (pas TileTitle, qui ne gère qu'une seule
                    icône) — tout sur un même axe horizontal : icône
                    openbook, texte, logo du chapitre (même taille que
                    l'icône openbook, 22px) puis le numéro de leçon, cf.
                    demande explicite du user. */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <MaskIcon src="/openbook.png" size={22} />
                  <span style={{ fontWeight: 600, fontSize: "1.1em", display: "flex", alignItems: "center" }}>
                    Reprendre la leçon
                    {/* 28.6px = 22*1.3 : augmenté de 30% — cf. demande
                        explicite du user. */}
                    <ChapitreLogo chapId={chapId} size="28.6px" style={{ marginInlineStart: 6 }} />
                    <span style={{ fontStyle: "italic", marginInlineStart: 4 }}>
                      {displayLessonNumber(referenceLesson)}
                    </span>
                  </span>
                </div>
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

        {/* Examen Blanc précède Examen (cf. demande explicite du user).
            Même format/tuile que Examen (TileTitle + card), mais grise
            (pas de card-dark, pas de recoloration blanche du logo) —
            exercices de traduction de phrases (même algorithme de tirage
            que l'ancien "revisions/question-ecrite", cf. examen-blanc dans
            App.jsx). height:EXAM_TILE_HEIGHT explicite et identique sur
            les deux tuiles (display:flex + alignItems:center pour centrer
            le contenu dedans) : garantit un format strictement identique
            entre les deux quel que soit le texte ("Examen" vs "Examen
            Blanc" n'ont pas la même longueur), plutôt que de compter sur
            un auto-sizing par contenu qui pourrait diverger — cf. demande
            explicite du user ("strictement de même format"). */}
        <div className="tile-list" style={{ gap: 8, margin: 0 }}>
          <Link to="/examen-blanc" className="card-link">
            <div
              className="card"
              style={{ textAlign: "center", height: EXAM_TILE_HEIGHT, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <TileTitle src="/examhat.png">Examen Blanc</TileTitle>
            </div>
          </Link>
          {/* Examen : fond noir, texte blanc, logo examhat recoloré en
              blanc (cf. demande explicite du user). L'état "dernier niveau
              atteint" garde le traitement grisé existant, sans le style
              noir/blanc — pas de hauteur forcée dans ce cas, le message
              n'a pas à matcher la tuile Examen Blanc. */}
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
