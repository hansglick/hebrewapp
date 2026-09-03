import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { getRandomCuriosite, getCuriositePool, getCuriositeItem } from "../../api/content";
import { mediaUrl } from "../../api/media";
import { useSwipe } from "../../hooks/useSwipe";
import { useRandomBrowser } from "../../hooks/useRandomBrowser";
import { ActionHints } from "../../components/ActionHints";
import { BottomNavBar } from "../../components/BottomNavBar";
import { SpeakerIcon } from "../../components/SpeakerIcon";
import { speak } from "../../utils/speech";
import { CURIOSITE_CONFIG } from "./curiositeConfig";
import "../screens.css";

const BOUNDARY_MESSAGE =
  "De nouveaux éléments se débloquent au fur et à mesure de ta progression dans le cours.";

// Écran générique de parcours des contenus "curiosités" (proverbe, tanakh,
// récit, landmark, blague) — un item à la fois, swipe/tap comme
// ExpressionScreen. `lessonCode` restreint aux nouveautés de cette leçon
// (tuile "Curiosité") : tirage aléatoire, comportement historique inchangé.
// Sans lui (bouton "Culture") : parcours simple de tout ce qui est débloqué
// à la progression courante, classé par récence décroissante, sans
// randomisation ni bouclage — cf. demande explicite du user.
export default function CuriositeScreen({ type, lessonCode }) {
  const navigate = useNavigate();
  const [showDetails, setShowDetails] = useState(false);
  const config = CURIOSITE_CONFIG[type];

  // Mode "leçon" — inchangé.
  const { current: randomItem, next: randomNext, back: randomBack } = useRandomBrowser(
    (prevItem) =>
      lessonCode ? getRandomCuriosite(type, { lessonCode, current: prevItem?.index }) : Promise.resolve(null),
    [type, lessonCode]
  );

  // Mode "Culture" — pool chargé une fois (ordre du plus récemment
  // débloqué au plus ancien, déjà trié côté backend), puis simple pointeur
  // dedans, jamais de nouveau tirage.
  const [pool, setPool] = useState(null);
  const [position, setPosition] = useState(0);
  const [orderedItem, setOrderedItem] = useState(null);
  const [atBoundary, setAtBoundary] = useState(null); // null | "start" | "end"

  useEffect(() => {
    if (lessonCode) return;
    setPool(null);
    setPosition(0);
    setOrderedItem(null);
    setAtBoundary(null);
    getCuriositePool(type).then((data) => setPool(data.pool));
  }, [type, lessonCode]);

  useEffect(() => {
    if (lessonCode || !pool || pool.length === 0) return;
    getCuriositeItem(type, pool[position]).then(setOrderedItem);
  }, [lessonCode, pool, position, type]);

  const item = lessonCode ? randomItem : orderedItem;

  useEffect(() => {
    setShowDetails(false);
  }, [item]);

  function goPrevious() {
    if (lessonCode) {
      if (!randomBack()) navigate(-1);
      return;
    }
    if (position > 0) {
      setAtBoundary(null);
      setPosition((p) => p - 1);
    } else {
      setAtBoundary("start");
    }
  }
  function goNext() {
    if (lessonCode) {
      randomNext();
      return;
    }
    if (pool && position < pool.length - 1) {
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

  // Mode "Culture" avec un pool vide (rien d'encore débloqué pour ce type) :
  // même message que la borne de fin, pas de carte à afficher.
  if (!lessonCode && pool && pool.length === 0) {
    return (
      <section className="screen" onPointerDown={swipeHandlers.onPointerDown}>
        <ActionHints {...swipeHandlers.hints} />
        <p className="muted" style={{ textAlign: "center", fontStyle: "italic" }}>
          {BOUNDARY_MESSAGE}
        </p>
      </section>
    );
  }

  if (!item) return null;

  const heroFontVar =
    config.heroFont === "biblical" ? "var(--font-hebrew-biblical)" : "var(--font-hebrew)";
  const heroStyle = {
    fontFamily: heroFontVar,
    fontSize: config.heroFontScale
      ? `calc(var(--font-size-hebrew-large) * ${config.heroFontScale})`
      : "var(--font-size-hebrew-large)",
    direction: "rtl",
    cursor: "pointer",
  };
  const speakButton = (
    <button
      type="button"
      className="speak-btn"
      onClick={() => speak(config.speakText ? config.speakText(item) : item[config.heroField])}
    >
      <SpeakerIcon color="var(--text)" />
    </button>
  );

  return (
    <section className="screen" style={{ paddingBottom: 80 }} onPointerDown={swipeHandlers.onPointerDown}>
      <ActionHints {...swipeHandlers.hints} />
      <BottomNavBar onPrevious={goPrevious} onNext={goNext} />

      {atBoundary && (
        <p className="muted" style={{ textAlign: "center", fontStyle: "italic", fontSize: "0.85em" }}>
          {BOUNDARY_MESSAGE}
        </p>
      )}

      {config.speakable &&
        !config.referenceValue &&
        !config.speakerWithHero &&
        !config.speakerBelowImage &&
        !config.speakerTopRight && (
        <div style={{ width: "100%", maxWidth: 320, display: "flex", justifyContent: "flex-end" }}>
          {speakButton}
        </div>
      )}

      <div
        className={`card card-illustration${config.hasImage ? ` curiosite-split curiosite-split-${type}` : ""}`}
        style={{ textAlign: "center" }}
      >
        <div className="curiosite-media">
          {config.hasImage && (
            <>
              <img
                className="screen-image"
                style={{ width: "100%", maxWidth: 420, maxHeight: "none", marginBottom: 12 }}
                src={mediaUrl(item.image_url)}
                alt=""
                draggable={false}
              />
              {config.speakerBelowImage && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                  {speakButton}
                </div>
              )}
              <hr className="curiosite-media-hr" style={{ border: "none", borderTop: "1px solid var(--border)", margin: "0 0 12px" }} />
            </>
          )}
        </div>

        <div className="curiosite-content">
          {config.referenceValue && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.5em",
              }}
            >
              <div
                style={{
                  textAlign: "left",
                  fontSize: "0.8em",
                  fontStyle: "italic",
                  color: "var(--textMuted)",
                }}
              >
                {config.referenceValue(item)}
              </div>
              {config.speakable && speakButton}
            </div>
          )}

          {config.speakerTopRight && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: -12 }}>{speakButton}</div>
          )}

          {config.speakerWithHero ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
              <div />
              <div className="hebrew" style={{ ...heroStyle, justifySelf: "center" }} onClick={() => setShowDetails((s) => !s)}>
                {item[config.heroField]}
              </div>
              <div style={{ justifySelf: "end" }}>{speakButton}</div>
            </div>
          ) : (
            <div className="hebrew" style={heroStyle} onClick={() => setShowDetails((s) => !s)}>
              {item[config.heroField]}
            </div>
          )}

          <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "12px 0 0" }} />

          {showDetails && (
            <ul
              style={{
                margin: "1.2em 0 0",
                paddingInlineStart: "1.2em",
                textAlign: "left",
                fontSize: "0.8em",
                color: "var(--textMuted)",
              }}
            >
              {config.bullets.map((bullet) => (
                <li key={bullet.label} style={{ marginBottom: "1em" }}>
                  <div
                    style={{
                      fontStyle: bullet.emphasis ? "normal" : "italic",
                      fontWeight: bullet.emphasis ? "bold" : undefined,
                      fontSize: "0.85em",
                      color: "var(--text)",
                    }}
                  >
                    {bullet.label} :
                  </div>
                  <div>{bullet.value ? bullet.value(item) : item[bullet.field]}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
