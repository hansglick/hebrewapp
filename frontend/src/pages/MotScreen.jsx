import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { getRandomMot, getRacine } from "../api/content";
import { getNiveau, createEvaluation, markObjectSeen } from "../api/user";
import { useSwipe } from "../hooks/useSwipe";
import { useRandomBrowser } from "../hooks/useRandomBrowser";
import { speak } from "../utils/speech";
import { ActionHints } from "../components/ActionHints";
import { BottomNavBar } from "../components/BottomNavBar";
import { SpeakerIcon } from "../components/SpeakerIcon";
import { RacineCard } from "../components/RacineCard";
import { PageTurnCurl, PAGE_TURN_TOTAL_DURATION_MS } from "../components/PageTurnCurl";
import { SectionTitle } from "../components/QuoteBlock";
import { PerfStat } from "../components/PerfStat";
import { QuestionMarkIcon } from "../components/QuestionMarkIcon";
import "./screens.css";

// Icônes UI statiques servies depuis frontend/public/, cf. AudioProgressBlock.jsx.
const SHIN_ICON_URL = "/shinletter.png";

// Même pastille numérotée que les titres des blocs audio des questions
// orales (cf. OralAnswerCapture.jsx::StepBadge, même taille/police) — cf.
// demande explicite du user.
const STEP_BADGE_SIZE = 25;
function StepBadge({ number, background, color }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: STEP_BADGE_SIZE,
        height: STEP_BADGE_SIZE,
        borderRadius: "50%",
        background,
        color,
        fontSize: "0.9375em",
        fontWeight: 700,
        marginRight: 12,
        flexShrink: 0,
      }}
    >
      {number}
    </span>
  );
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// shinletter.png est un pictogramme noir plein (pas une icône déjà colorée,
// contrairement à point-dinterrogation.png) — même technique que
// lecture.png/voice.png (cf. AudioProgressBlock.jsx/.css) : mask-image
// plutôt qu'un <img>, pour pouvoir en piloter la couleur en CSS. Noir fixe
// (pas var(--accent), qui suivait la couleur du caractère "ש" remplacé) —
// cf. demande explicite du user.
const shinIconStyle = {
  display: "inline-block",
  width: 22,
  height: 22,
  backgroundColor: "#000",
  WebkitMaskImage: `url(${SHIN_ICON_URL})`,
  maskImage: `url(${SHIN_ICON_URL})`,
  WebkitMaskSize: "contain",
  maskSize: "contain",
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
  WebkitMaskPosition: "center",
  maskPosition: "center",
};

export default function MotScreen() {
  const { code } = useParams(); // présent seulement si venu par une leçon précise
  const location = useLocation();
  const [niveau, setNiveau] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [racineDetails, setRacineDetails] = useState(null);
  const [racineOpen, setRacineOpen] = useState(false); // pilote l'animation "tapis" (cf. toggleRacineInline)
  const [pulse, setPulse] = useState(null); // "success" | "danger" | null
  const [flip, setFlip] = useState(null); // { dir, mot, phase: "start" | "animating" }
  const flipTimeoutRef = useRef(null);
  // Force PerfBubble à recalculer son % juste après chaque évaluation
  // envoyée — cf. demande explicite du user ("en direct").
  const [perfVersion, setPerfVersion] = useState(0);

  // Le mode découle du chemin d'accès : apprentissage (code présent) parcourt
  // simplement la liste ordonnée de la leçon ; révisions (code absent) tire
  // selon la difficulté/récence. Ce n'est plus un choix utilisateur — le
  // raccourci "révisions" existe justement pour réviser sans dépendre d'une
  // leçon précise.
  const mode = code ? "exploration" : "revision";

  useEffect(() => {
    getNiveau().then(setNiveau);
  }, []);

  const lessonCode = code ?? niveau?.reference_lesson;

  // Si on revient d'un écran racine (flèche gauche), location.state.restoreMot
  // contient le mot exact quitté — évite de retomber sur un tirage aléatoire.
  // Tant qu'on restaure, on fige lessonCode dans les deps : sinon la
  // résolution asynchrone de `niveau` (undefined -> valeur réelle, juste
  // après le montage) déclenche un second effet qui écraserait la
  // restauration par un tirage aléatoire. `mode` reste réactif : un
  // changement manuel de mode doit toujours déclencher un nouveau tirage.
  const restoreMot = location.state?.restoreMot;
  const browserDeps = restoreMot ? ["__restore__", mode] : [lessonCode, mode];

  const { current: mot, next, back } = useRandomBrowser(
    (prevMot, seen) => (lessonCode ? getRandomMot(lessonCode, mode, prevMot?.key, seen) : Promise.resolve(null)),
    browserDeps,
    restoreMot
  );

  // La fiche racine se déroule comme un tapis directement sous la rangée
  // haut-parleur/shin (exploration et révision), entre elle et le trait
  // horizontal, plutôt que de naviguer vers un écran séparé ou de
  // s'afficher en superposition sous tout le reste — cf. demande explicite
  // du user. racineOpen (booléen, pilote l'animation) est dissocié de
  // racineDetails (les données, gardées en mémoire même une fois refermé)
  // : sans cette séparation, refermer effacerait racineDetails
  // instantanément et démonterait la fiche avant que l'animation de
  // fermeture n'ait eu le temps de jouer.
  function toggleRacineInline() {
    if (racineOpen) {
      setRacineOpen(false);
      return;
    }
    if (mot.racine) getRacine(mot.racine).then((data) => {
      setRacineDetails(data);
      setRacineOpen(true);
    });
  }

  useEffect(() => {
    setRevealed(false);
    setRacineDetails(null);
    setRacineOpen(false);
    setPulse(null);
  }, [mot]);

  // Progression d'exploration de la leçon (cf. GET /api/lecons/{code}/
  // exploration) : "vu" quel que soit le mode, indépendant du useEffect
  // ci-dessus.
  useEffect(() => {
    if (mot) markObjectSeen({ objectType: "mot", objectKey: mot.key });
  }, [mot]);

  // Anime brièvement le bouton choisi avant de passer au mot suivant, pour
  // que le user perçoive bien son choix (surtout via les raccourcis clavier
  // 1/0 qui n'ont pas de retour visuel de "clic").
  function handleEvaluate(success) {
    setPulse(success ? "success" : "danger");
    createEvaluation({ objectType: "mot", objectKey: `${mot.key}|${mot.langue}`, success }).then(() => {
      setPerfVersion((v) => v + 1);
      setTimeout(() => {
        setPulse(null);
        next();
      }, 350);
    });
  }

  useEffect(() => {
    if (mode !== "revision" || !revealed) return;
    function handleKeyDown(e) {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "1") handleEvaluate(true);
      else if (e.key === "0") handleEvaluate(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, revealed, mot]);

  // Animation "tourner la page" (cf. PageTurnCurl, validée sur le
  // prototype /dev/page-turn-preview, déjà appliquée aux curiosités) —
  // leçon ET révisions, cf. demande explicite du user ("tous les objets
  // présents dans révisions qui sont itérables"). Capture le mot ACTUEL
  // (et, en révisions, l'état de révélation/pulse) comme page "sortante"
  // avant de lancer la vraie navigation ci-dessous (qui met à jour le mot
  // affiché via un nouveau tirage).
  function startFlip(dir) {
    if (flip || !mot) return;
    setFlip({ dir, mot, revealed, pulse, phase: "start" });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setFlip((f) => (f ? { ...f, phase: "animating" } : f));
      });
    });
    clearTimeout(flipTimeoutRef.current);
    flipTimeoutRef.current = setTimeout(() => setFlip(null), PAGE_TURN_TOTAL_DURATION_MS);
  }

  // Sur le tout premier mot de la session (pas encore d'historique), back()
  // ne fait rien plutôt que de sortir de l'écran (navigate(-1)) : previous/
  // next ne doivent jamais faire quitter le type d'objet parcouru, cf.
  // demande explicite du user.
  function goPrevious() {
    if (flip) return;
    const moved = back();
    if (moved) startFlip("prev");
  }
  function goNext() {
    if (flip) return;
    startFlip("next");
    next();
  }

  const swipeHandlers = useSwipe({
    onSwipeLeft: goPrevious,
    onSwipeRight: goNext,
    onSpace:
      mode === "exploration"
        ? toggleRacineInline
        : !revealed
        ? () => setRevealed(true)
        : undefined,
  });

  if (!mot) return null;

  // Rendu de la page "mot" en exploration pour un mot donné — utilisé à la
  // fois pour la page "au repos" et, via PageTurnCurl, pour la page
  // "sortante" pendant l'animation (cf. startFlip). position:absolute +
  // inset:0 + fond propre (au lieu de flex:1 normal) : nécessaire pour que
  // les bandes de PageTurnCurl (clip-path) se découpent sur une boîte bien
  // définie ; overflowY:auto (au lieu de compter sur le scroll de la page)
  // pour que la fiche racine dépliée reste atteignable malgré l'overflow:
  // hidden du conteneur de pivot ci-dessous.
  function renderExplorationMot(cardMot) {
    function handleRacineClick() {
      if (racineOpen) {
        setRacineOpen(false);
        return;
      }
      if (cardMot.racine) getRacine(cardMot.racine).then((data) => {
        setRacineDetails(data);
        setRacineOpen(true);
      });
    }
    return (
      <div
        className="page-turn-card"
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--bg)",
          overflowY: "auto",
          backfaceVisibility: "hidden",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          // "safe center" (pas juste "center") : sans ce filet de sécurité,
          // dès que la fiche racine dépliée rend le contenu plus grand que
          // l'espace disponible, le centrage pousse le haut du contenu
          // hors de l'écran sans retomber sur un alignement en haut — et
          // comme ce conteneur est en overflowY:auto, ce qui sort par le
          // haut devient inaccessible (impossible de scroller au-delà de
          // 0) — cf. bug rapporté par le user (encadré tronqué, éléments
          // au-dessus du trait disparus).
          justifyContent: "safe center",
        }}
      >
        <div style={{ position: "relative", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <span className="hebrew" style={{ fontWeight: 700, fontSize: "2.925em" }}>
            {cardMot.original}
          </span>

          <span className="hebrew-word-row" style={{ justifyContent: "center" }}>
            <button type="button" className="speak-btn" onClick={() => speak(cardMot.original)}>
              <SpeakerIcon color="var(--speakerIcon)" size={27} />
            </button>
            <button type="button" className="speak-btn" onClick={handleRacineClick}>
              <span style={shinIconStyle} />
            </button>
          </span>

          {/* Fiche racine "tapis" : se déroule vers le bas depuis la
              rangée haut-parleur/shin, bordure supérieure juste
              au-dessus du trait — cf. demande explicite du user.
              Technique CSS grid-template-rows 0fr<->1fr (pas de hauteur
              fixe à calculer en JS, s'anime "auto" nativement) + overflow
              hidden sur l'enfant pour clipper le contenu pendant
              l'animation. Toujours monté (racineOpen pilote uniquement la
              hauteur) pour que la fermeture s'anime aussi, pas seulement
              l'ouverture. marginTop:-27 : mesuré en direct via Claude in
              Chrome (getBoundingClientRect) — espace shin->bordure
              supérieure de l'encadré réduit de 50% (54px -> 27px), même
              valeur que renderRevisionMot (structure identique) — cf.
              demande explicite du user. */}
          <div
            style={{
              width: "100%",
              display: "grid",
              gridTemplateRows: racineOpen ? "1fr" : "0fr",
              transition: "grid-template-rows 300ms ease",
              marginTop: -27,
            }}
          >
            <div style={{ overflow: "hidden", minHeight: 0 }}>
              {racineDetails && (
                <div style={{ paddingBottom: 14 }}>
                  <RacineCard racine={racineDetails} />
                </div>
              )}
            </div>
          </div>

          <hr
            style={{
              width: "70%",
              maxWidth: 400,
              border: "none",
              borderTop: "1px solid var(--cardBorder)",
              margin: 0,
            }}
          />

          <span style={{ fontStyle: "italic", fontSize: "1.3em", color: "var(--textSecondary)" }}>{cardMot.french}</span>
        </div>
      </div>
    );
  }

  // Rendu d'une carte de révision (mot+racine+hp / trait / mot traduit +
  // ✗/✓, avec révélation via le badge "?") — utilisé pour la page au repos
  // et, via PageTurnCurl, pour la page "sortante" pendant l'animation
  // (leçon ET révisions, cf. demande explicite du user "tous les objets
  // présents dans révisions qui sont itérables"). Les handlers
  // (toggleRacineInline/setRevealed/handleEvaluate) restent branchés sur
  // l'état LIVE du composant, pas sur cardRevealed/cardPulse — même
  // convention que renderExplorationMot/QuestionOraleScreen.
  function renderRevisionMot(cardMot, cardRevealed, cardPulse) {
    return (
      <div
        className="page-turn-card"
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--bg)",
          overflowY: "auto",
          backfaceVisibility: "hidden",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          // "safe center" (pas juste "center") : sans ce filet de sécurité,
          // dès que la fiche racine dépliée rend le contenu plus grand que
          // l'espace disponible, le centrage pousse le haut du contenu
          // hors de l'écran sans retomber sur un alignement en haut — et
          // comme ce conteneur est en overflowY:auto, ce qui sort par le
          // haut devient inaccessible (impossible de scroller au-delà de
          // 0) — cf. bug rapporté par le user (encadré tronqué, éléments
          // au-dessus du trait disparus).
          justifyContent: "safe center",
        }}
      >
        <div style={{ position: "relative", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          {/* Pastille "1" + mini-titre, au-dessus de l'extrémité GAUCHE du
              trait — même pastille/police que les titres des blocs audio
              des questions orales (cf. StepBadge/SectionTitle). Même
              largeur ET même width:"70% / maxWidth:400" que le trait
              (pas juste maxWidth:400) : les deux boîtes, centrées l'une
              comme l'autre, doivent avoir la MÊME largeur pour que leurs
              bords gauches coïncident exactement, cf. demande explicite du
              user. marginBottom:14 (avec le gap:14 du conteneur, 28 au
              total) : la pastille (pavé plein rond) paraissait plus
              proche du mot hébreu que le logo shin ne l'est du trait
              malgré un espace CSS égal — même effet optique que le badge
              "?" plus haut dans l'écran — cf. demande explicite du user.
              display:"flow-root" : empêche le marginBottom:8 propre à
              SectionTitle de "fuiter" à travers cette boîte (collapsing
              margins CSS) et de fausser le calcul ci-dessus.
              marginTop:14 : pousse tout le groupe (premier enfant d'un
              conteneur centré verticalement) vers le bas — cf. demande
              explicite du user ("descend"). marginBottom:-1 : mesuré en
              direct via Claude in Chrome (getBoundingClientRect) et
              ajusté empiriquement jusqu'à égaler l'écart shin->trait
              (21px) — cf. demande explicite du user ("équidistance"). */}
          <div style={{ width: "70%", maxWidth: 400, marginTop: 14, marginBottom: -1, display: "flow-root" }}>
            {/* gris non gras (au lieu du bleu marine par défaut) — cf.
                demande explicite du user. */}
            <SectionTitle fontSize="0.84em" color="#9ca3af" fontWeight={400}>
              <StepBadge number={1} background="#dbeafe" color="#1d4ed8" />
              Traduis le mot hébreu
            </SectionTitle>
          </div>

          {/* Non gras + noir (var(--textPrimary), remplace le gris clair
              précédent) — cf. demande explicite du user. marginBottom:13 :
              depuis la suppression des logos haut-parleur/shin (qui
              créaient l'espace avec le trait), le mot touchait presque le
              trait (8px, gap:14 du conteneur + marginTop:-27 du panneau
              racine collapsé) — ce marginBottom ramène l'écart à 21px, la
              même valeur "équidistance" déjà utilisée comme référence dans
              cet écran — cf. demande explicite du user. */}
          <span
            className="hebrew"
            style={{ fontWeight: 700, fontSize: "2.925em", color: "var(--textPrimary)", marginBottom: 13 }}
          >
            {cardMot.original}
          </span>

          {/* Fiche racine "tapis" : se déroule vers le bas depuis la
              rangée haut-parleur/shin, bordure supérieure juste
              au-dessus du trait — cf. demande explicite du user (même
              technique que renderExplorationMot, cf. son commentaire).
              marginTop:-27 : mesuré en direct via Claude in Chrome
              (getBoundingClientRect) — espace shin->bordure supérieure de
              l'encadré à 54px, réduit de 50% (27px) — cf. demande
              explicite du user. */}
          <div
            style={{
              width: "100%",
              display: "grid",
              gridTemplateRows: racineOpen ? "1fr" : "0fr",
              transition: "grid-template-rows 300ms ease",
              marginTop: -27,
            }}
          >
            <div style={{ overflow: "hidden", minHeight: 0 }}>
              {racineDetails && (
                <div style={{ paddingBottom: 14 }}>
                  <RacineCard racine={racineDetails} />
                </div>
              )}
            </div>
          </div>

          <div style={{ width: "70%", maxWidth: 400, marginTop: 7 }}>
            <hr
              style={{
                border: "none",
                borderTop: "1px solid var(--cardBorder)",
                margin: 0,
              }}
            />
          </div>

          {/* Pastille "2" (vert pastel) + mini-titre "Réponse", même
              traitement que la pastille "1" ci-dessus (width:"70%" pour
              coïncider avec l'extrémité gauche du trait). marginTop:14
              (au lieu de 7), même raison que la pastille "1" ci-dessus.
              display:"flow-root" : sans lui, le marginBottom:8 de
              SectionTitle fuitait vers le bloc suivant (mot traduit +
              logos ✗/✓ une fois révélé), l'éloignant de 8px de trop par
              rapport à cette ligne "Réponse" — cf. demande explicite du
              user ("remonte le bloc... traduit"). */}
          {/* marginTop:7 : redescend ce bloc (la pastille PERF. ne se
              trouve plus juste sous le trait) pour égaler à nouveau
              l'écart mot hébreu->trait (21px), cf. demande explicite du
              user ("même espace... entre le titre du bloc 2 et la barre
              horizontale au-dessus"). */}
          <div style={{ width: "70%", maxWidth: 400, marginTop: 7, display: "flow-root" }}>
            {/* gris non gras (au lieu du bleu marine par défaut) — cf.
                demande explicite du user. */}
            <SectionTitle fontSize="0.84em" color="#9ca3af" fontWeight={400}>
              <StepBadge number={2} background="var(--validationGrisee)" color="var(--validationPleine)" />
              Réponse
            </SectionTitle>
          </div>

          <div style={{ display: "grid", justifyItems: "center" }}>
            <div
              style={{
                gridArea: "1 / 1",
                visibility: cardRevealed ? "hidden" : "visible",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "center",
                marginTop: 18,
              }}
            >
              <button type="button" className="speak-btn" onClick={() => setRevealed(true)} disabled={cardRevealed}>
                {/* 36x36 (48*0.75) : réduit de 25% — cf. demande explicite
                    du user. Fond noir (var(--textPrimary)), remplace le
                    gris clair précédent — cf. demande explicite du user. */}
                <QuestionMarkIcon size={36} background="var(--textPrimary)" style={{ display: "block" }} />
              </button>
            </div>

            <div
              style={{
                gridArea: "1 / 1",
                visibility: cardRevealed ? "visible" : "hidden",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 20,
                // -1 : mesuré en direct via Claude in Chrome
                // (getBoundingClientRect) et ajusté empiriquement jusqu'à
                // égaler l'espace pastille bleue -> mot hébreu (21px) —
                // cf. demande explicite du user.
                marginTop: -1,
              }}
            >
              <span style={{ fontStyle: "italic", fontSize: "1.3em", color: "var(--textPrimary)" }}>
                {capitalize(cardMot.french)}
              </span>
              <div style={{ display: "flex", gap: 0 }}>
                <button
                  type="button"
                  className={`eval-btn danger${cardPulse === "danger" ? " pulse" : ""}`}
                  onClick={() => handleEvaluate(false)}
                >
                  <img src="/wrong.png" alt="Faux" width={36} height={36} draggable={false} />
                </button>
                <button
                  type="button"
                  className={`eval-btn success${cardPulse === "success" ? " pulse" : ""}`}
                  onClick={() => handleEvaluate(true)}
                >
                  <img src="/right.png" alt="Vrai" width={36} height={36} draggable={false} />
                </button>
              </div>
            </div>
          </div>

          {/* Alignée sous le point d'interrogation / la solution révélée,
              justifiée à droite pour que la fin de la chaîne coïncide avec
              l'extrémité droite du trait — cf. demande explicite du user. */}
          <div style={{ width: "70%", maxWidth: 400, marginTop: -6 }}>
            <PerfStat objectType="mot" refreshKey={perfVersion} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="screen" style={{ paddingBottom: "calc(var(--bottom-nav-height) * 2)", flex: 1 }} onPointerDown={swipeHandlers.onPointerDown}>
      <ActionHints {...swipeHandlers.hints} digits={mode === "revision" && revealed} />
      <BottomNavBar onPrevious={goPrevious} onNext={goNext} />


      {/* Plein écran (position:relative + perspective) plutôt que flex:1
          normal, pour porter l'animation "tourner la page" au changement
          de mot — cf. renderExplorationMot/PageTurnCurl, demande explicite
          du user ("aux objets mots dans leçons"). */}
      {mode === "exploration" && (
        <div style={{ position: "relative", flex: 1, width: "100%", perspective: 1600, overflow: "hidden" }}>
          {renderExplorationMot(mot)}
          {flip && <PageTurnCurl dir={flip.dir} phase={flip.phase} renderPage={() => renderExplorationMot(flip.mot)} />}
        </div>
      )}

      {/* Même technique que le bloc exploration ci-dessus (plein écran +
          PageTurnCurl) — leçon ET révisions, cf. demande explicite du user
          ("tous les objets présents dans révisions qui sont itérables"),
          cf. renderRevisionMot. */}
      {mode === "revision" && (
        <div style={{ position: "relative", flex: 1, width: "100%", perspective: 1600, overflow: "hidden" }}>
          {renderRevisionMot(mot, revealed, pulse)}
          {flip && (
            <PageTurnCurl
              dir={flip.dir}
              phase={flip.phase}
              renderPage={() => renderRevisionMot(flip.mot, flip.revealed, flip.pulse)}
            />
          )}
        </div>
      )}
    </section>
  );
}
