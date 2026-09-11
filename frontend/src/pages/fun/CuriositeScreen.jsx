import { useEffect, useRef, useState } from "react";
import { getRandomCuriosite, getCuriositePool, getCuriositeLessonPool, getCuriositeItem } from "../../api/content";
import { mediaUrl } from "../../api/media";
import { useSwipe } from "../../hooks/useSwipe";
import { useRandomBrowser } from "../../hooks/useRandomBrowser";
import { ActionHints } from "../../components/ActionHints";
import { BottomNavBar } from "../../components/BottomNavBar";
import { SpeakerIcon } from "../../components/SpeakerIcon";
import { PageTurnCurl, PAGE_TURN_TOTAL_DURATION_MS } from "../../components/PageTurnCurl";
import { speak } from "../../utils/speech";
import { CURIOSITE_CONFIG } from "./curiositeConfig";
import "../screens.css";

const BOUNDARY_MESSAGE =
  "De nouveaux éléments se débloquent au fur et à mesure de ta progression dans le cours.";

// Mention discrète affichée en haut de chaque item du pool fusionné
// "bible" (récit + citation + proverbe), pour indiquer sans y insister de
// quel sous-type il s'agit — cf. demande explicite du user. Distincte des
// labels de CURIOSITE_CONFIG (utilisés pour les tuiles), formulation
// propre à ce contexte.
const BIBLE_TYPE_LABELS = {
  recit: "Récit du Tanakh",
  tanakh: "Citation de la bible",
  proverb: "Proverbe biblique",
};

// Écran générique de parcours des contenus "curiosités" (proverbe, tanakh,
// récit, landmark, blague, expression, presse, mot d'origine hébraïque) —
// un item à la fois. `lessonCode` restreint aux nouveautés de cette leçon
// (tuile "Curiosité") : tirage aléatoire, comportement historique inchangé.
// Sans lui (portail "Culture") : parcours simple de tout ce qui est
// débloqué à la progression courante, classé par récence décroissante,
// sans randomisation ni bouclage.
//
// Rendu plein écran (fond var(--bg), pas d'encadré/bordure/ombre) avec
// animation "tourner la page" (cf. PageTurnCurl, validée sur le prototype
// /dev/page-turn-preview) au changement d'objet — appliqué à tous les
// types (tous les objets accessibles depuis le portail Culture), cf.
// demande explicite du user.
export default function CuriositeScreen({ type, types, lessonCode }) {
  const [showDetails, setShowDetails] = useState(false);
  // `types` (tableau) : mode "fusionné" — le user parcourt un seul
  // ensemble mélangeant plusieurs types (ex: bible = récit + citation +
  // proverbe, sans distinction affichée dans les segments de l'image map,
  // juste une mention discrète par item, cf. BIBLE_TYPE_LABELS), chaque
  // item gardant son propre type d'origine (__type) pour savoir quelle
  // config appliquer — cf. demande explicite du user ("Coin culture
  // fast"). PAS de tirage aléatoire ici (contrairement au mode leçon
  // mono-type, cf. plus bas) : le user a explicitement demandé un
  // parcours séquentiel de tout ce qui est débloqué à cette leçon pour
  // ces types, dans un ordre figé (peu importe lequel) — cf. le pool
  // fusionné juste en dessous.
  const multiType = Array.isArray(types) && types.length > 0;
  const configFor = (cardItem) => (multiType ? CURIOSITE_CONFIG[cardItem.__type] : CURIOSITE_CONFIG[type]);
  const [flip, setFlip] = useState(null); // { dir, item, phase: "start" | "animating" }
  const flipTimeoutRef = useRef(null);

  // Mode "leçon" mono-type (tuile "Curiosité" d'un des 5 autres segments,
  // ex: presse/landmark/blague) — inchangé : tirage aléatoire dans le
  // delta de cette leçon (en pratique 0 ou 1 item la plupart du temps, le
  // calendrier de déblocage étalant les items sur les 159 leçons — cf.
  // clarification du user, il n'y a alors rien de significatif à
  // randomiser). Jamais utilisé en mode fusionné (multiType), qui passe
  // par le pool séquencé ci-dessous à la place.
  const { current: randomItem, next: randomNext, back: randomBack } = useRandomBrowser(
    (prevItem) =>
      lessonCode && !multiType
        ? getRandomCuriosite(type, { lessonCode, current: prevItem?.index })
        : Promise.resolve(null),
    [type, lessonCode]
  );

  // Pool séquencé (ordre figé, pas de randomisation), simple pointeur
  // dedans — utilisé par le portail "Culture" (pool cumulatif mono-type,
  // comportement inchangé) ET par le mode fusionné (multiType), qui lui
  // fusionne le pool DELTA de cette leçon pour chacun des `types` (cf.
  // getCuriositeLessonPool) en une seule liste de {type, index}, dans
  // l'ordre des types passés — cf. demande explicite du user.
  const [pool, setPool] = useState(null);
  const [position, setPosition] = useState(0);
  const [orderedItem, setOrderedItem] = useState(null);
  const [atBoundary, setAtBoundary] = useState(null); // null | "start" | "end"

  useEffect(() => {
    if (lessonCode && !multiType) return;
    setPool(null);
    setPosition(0);
    setOrderedItem(null);
    setAtBoundary(null);
    if (multiType) {
      Promise.all(
        types.map((t) =>
          getCuriositeLessonPool(t, lessonCode).then((data) => data.pool.map((index) => ({ type: t, index })))
        )
      ).then((lists) => setPool(lists.flat()));
    } else {
      getCuriositePool(type).then((data) => setPool(data.pool));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, multiType ? types.join(",") : null, lessonCode]);

  useEffect(() => {
    if ((lessonCode && !multiType) || !pool || pool.length === 0) return;
    if (multiType) {
      const entry = pool[position];
      getCuriositeItem(entry.type, entry.index).then((data) => setOrderedItem({ ...data, __type: entry.type }));
    } else {
      getCuriositeItem(type, pool[position]).then(setOrderedItem);
    }
  }, [lessonCode, multiType, pool, position, type]);

  const item = lessonCode && !multiType ? randomItem : orderedItem;

  useEffect(() => {
    setShowDetails(false);
  }, [item]);

  // Capture l'item ACTUEL (celui qu'on quitte) comme page "sortante" avant
  // de lancer la vraie navigation ci-dessous (qui, elle, met à jour l'item
  // affiché — via un nouveau tirage ou un décalage de position) — cf.
  // PageTurnCurl, demande explicite du user. Un seul flip à la fois (clics
  // rapides ignorés pendant qu'une page tourne déjà), même limite que sur
  // le prototype /dev/page-turn-preview.
  // Pas d'animation en mode leçon MONO-TYPE (tuile "Curiosité" classique) :
  // un seul objet unique à voir dans ce contexte, pas une séquence à
  // parcourir — cf. demande explicite du user. En revanche, le mode
  // fusionné (multiType, ex: bible) EST une vraie séquence à parcourir
  // (comme le portail Culture) : l'animation s'applique aussi ici — cf.
  // demande explicite du user.
  function startFlip(dir) {
    if ((lessonCode && !multiType) || flip || !item) return;
    setFlip({ dir, item, phase: "start" });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setFlip((f) => (f ? { ...f, phase: "animating" } : f));
      });
    });
    clearTimeout(flipTimeoutRef.current);
    flipTimeoutRef.current = setTimeout(() => setFlip(null), PAGE_TURN_TOTAL_DURATION_MS);
  }

  // startFlip n'est appelé que quand la navigation va réellement changer
  // l'item affiché — sinon (bornes de début/fin) la page "sortante"
  // reviendrait tout de suite affichée un contenu identique, une
  // animation pour rien, cf. demande explicite du user.
  function goPrevious() {
    if (flip) return;
    if (lessonCode && !multiType) {
      // Sur la toute première curiosité de la session (pas encore
      // d'historique), randomBack() ne fait rien plutôt que de sortir de
      // l'écran (navigate(-1)) : previous/next ne doivent jamais faire
      // quitter le type d'objet parcouru, cf. demande explicite du user.
      const moved = randomBack();
      if (moved) startFlip("prev");
      return;
    }
    if (position > 0) {
      startFlip("prev");
      setAtBoundary(null);
      setPosition((p) => p - 1);
    } else {
      setAtBoundary("start");
    }
  }
  function goNext() {
    if (flip) return;
    if (lessonCode && !multiType) {
      startFlip("next");
      randomNext();
      return;
    }
    if (pool && position < pool.length - 1) {
      startFlip("next");
      setAtBoundary(null);
      setPosition((p) => p + 1);
    } else {
      setAtBoundary("end");
    }
  }

  const swipeHandlers = useSwipe({
    onSwipeLeft: goPrevious,
    onSwipeRight: goNext,
    onSpace: !showDetails ? () => setShowDetails(true) : undefined,
  });

  // Pool vide (rien d'encore débloqué pour ce type, ou pour aucun des
  // types fusionnés à cette leçon) : pas de carte à afficher. Le message
  // "de nouveaux éléments se débloquent..." ne concerne QUE le portail
  // Culture (!lessonCode, parcours cumulatif de tout le cours) — en mode
  // fusionné dans une leçon (multiType), il n'a pas de sens (on est déjà
  // à l'intérieur d'une leçon précise, rien à "débloquer" ici) — cf.
  // demande explicite du user.
  if ((!lessonCode || multiType) && pool && pool.length === 0) {
    return (
      <section className="screen" onPointerDown={swipeHandlers.onPointerDown}>
        <ActionHints {...swipeHandlers.hints} />
        {!multiType && (
          <p className="muted" style={{ textAlign: "center", fontStyle: "italic" }}>
            {BOUNDARY_MESSAGE}
          </p>
        )}
      </section>
    );
  }

  if (!item) return null;

  // Rendu d'une page pleine (fond = var(--bg), pas d'encadré/bordure/
  // ombre) pour un item donné — utilisé à la fois pour la page "au repos"
  // et, via PageTurnCurl, pour la page "sortante" pendant l'animation.
  // Reprend fidèlement les mêmes variantes de mise en page que l'ancien
  // encadré .card (referenceValue/speakerTopRight/speakerBelowImage/
  // speakerWithHero, pilotées par curiositeConfig), juste sans boîte.
  // config recalculée PAR item (pas une fois globalement) : en mode
  // fusionné, chaque item peut être d'un type différent (cf. __type).
  function renderCard(cardItem) {
    const config = configFor(cardItem);
    const heroFontVar = config.heroFont === "biblical" ? "var(--font-hebrew-biblical)" : "var(--font-hebrew)";
    const heroStyle = {
      fontFamily: heroFontVar,
      fontSize: config.heroFontScale
        ? `calc(var(--font-size-hebrew-large) * ${config.heroFontScale})`
        : "var(--font-size-hebrew-large)",
      direction: "rtl",
      cursor: "pointer",
    };

    const cardSpeakButton = (
      <button
        type="button"
        className="speak-btn"
        onClick={() => speak(config.speakText ? config.speakText(cardItem) : cardItem[config.heroField])}
      >
        <SpeakerIcon color="var(--speakerIcon)" />
      </button>
    );

    return (
      <div
        className="page-turn-card"
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--bg)",
          overflowY: "auto",
          backfaceVisibility: "hidden",
          padding: "16px 16px 32px",
          boxSizing: "border-box",
          textAlign: "center",
        }}
      >
        {multiType && (
          <p style={{ margin: "0 0 10px", fontSize: "0.75em", color: "var(--textSecondary)" }}>
            {BIBLE_TYPE_LABELS[cardItem.__type]}
          </p>
        )}

        {config.hasImage && (
          <>
            <img
              className="screen-image"
              style={{ width: "100%", maxWidth: 420, maxHeight: "none", display: "block", margin: "0 auto 12px" }}
              src={mediaUrl(cardItem.image_url)}
              alt=""
              draggable={false}
            />
            {config.speakerBelowImage && (
              <div style={{ display: "flex", justifyContent: "flex-end", maxWidth: 420, margin: "0 auto 4px" }}>
                {cardSpeakButton}
              </div>
            )}
            <hr style={{ border: "none", borderTop: "1px solid var(--cardBorder)", margin: "0 0 12px" }} />
          </>
        )}

        {config.referenceValue && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              maxWidth: 420,
              margin: "0 auto 0.5em",
            }}
          >
            <div style={{ textAlign: "left", fontSize: "0.8em", fontStyle: "italic", color: "var(--textSecondary)" }}>
              {config.referenceValue(cardItem)}
            </div>
            {config.speakable && cardSpeakButton}
          </div>
        )}

        {config.speakerTopRight && (
          <div style={{ display: "flex", justifyContent: "flex-end", maxWidth: 420, margin: "0 auto -12px" }}>
            {cardSpeakButton}
          </div>
        )}

        {config.speakerWithHero ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", maxWidth: 420, margin: "0 auto" }}>
            <div />
            <div className="hebrew" style={{ ...heroStyle, justifySelf: "center" }} onClick={() => setShowDetails((s) => !s)}>
              {cardItem[config.heroField]}
            </div>
            <div style={{ justifySelf: "end" }}>{cardSpeakButton}</div>
          </div>
        ) : (
          <div className="hebrew" style={{ ...heroStyle, maxWidth: 420, margin: "0 auto" }} onClick={() => setShowDetails((s) => !s)}>
            {cardItem[config.heroField]}
          </div>
        )}

        <hr style={{ border: "none", borderTop: "1px solid var(--cardBorder)", margin: "12px 0 0" }} />

        {showDetails && (
          <ul
            style={{
              margin: "1.2em auto 0",
              maxWidth: 420,
              paddingInlineStart: "1.2em",
              textAlign: "left",
              fontSize: "0.8em",
              color: "var(--textSecondary)",
            }}
          >
            {config.bullets.map((bullet) => (
              <li key={bullet.label} style={{ marginBottom: "1em" }}>
                <div
                  style={{
                    fontStyle: bullet.emphasis ? "normal" : "italic",
                    fontWeight: bullet.emphasis ? "bold" : undefined,
                    fontSize: "0.85em",
                    color: "var(--textPrimary)",
                  }}
                >
                  {bullet.label} :
                </div>
                <div>{bullet.value ? bullet.value(cardItem) : cardItem[bullet.field]}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <section
      className="screen"
      style={{ flex: 1, width: "100%", alignItems: "stretch", padding: 0, gap: 0 }}
      onPointerDown={swipeHandlers.onPointerDown}
    >
      <ActionHints {...swipeHandlers.hints} />

      {/* Idem : ce message n'a de sens que dans le portail Culture (le
          cours continue de se débloquer), pas ici où on est déjà dans une
          leçon précise — cf. demande explicite du user. */}
      {atBoundary && !multiType && (
        <p className="muted" style={{ textAlign: "center", fontStyle: "italic", fontSize: "0.85em", margin: "8px 0 0" }}>
          {BOUNDARY_MESSAGE}
        </p>
      )}

      <div style={{ position: "relative", flex: 1, width: "100%", perspective: 1600, overflow: "hidden" }}>
        {renderCard(item)}
        {flip && <PageTurnCurl dir={flip.dir} phase={flip.phase} renderPage={() => renderCard(flip.item)} />}
      </div>

      <BottomNavBar onPrevious={goPrevious} onNext={goNext} />
    </section>
  );
}
