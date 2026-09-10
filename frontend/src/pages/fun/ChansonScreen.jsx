import { useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { getRandomChanson } from "../../api/content";
import { youtubeEmbedUrl } from "../../api/media";
import { useSwipe } from "../../hooks/useSwipe";
import { useRandomBrowser } from "../../hooks/useRandomBrowser";
import { ActionHints } from "../../components/ActionHints";
import { BottomNavBar } from "../../components/BottomNavBar";
import { PageTurnCurl, PAGE_TURN_TOTAL_DURATION_MS } from "../../components/PageTurnCurl";
import "../screens.css";

export default function ChansonScreen() {
  const location = useLocation();
  // Si on arrive depuis l'écran de recherche (chanson tout juste extraite),
  // location.state.initialChanson contient déjà l'objet complet — on
  // l'affiche directement au lieu d'en tirer un au hasard (cf. restoreMot
  // dans MotScreen, même principe).
  const initialChanson = location.state?.initialChanson;
  const { current: chanson, next, back } = useRandomBrowser(
    getRandomChanson,
    initialChanson ? ["__initial__"] : [],
    initialChanson
  );

  // Animation "tourner la page" au changement de chanson — même technique
  // que les écrans révisions (cf. MotScreen.jsx::startFlip) — cf. demande
  // explicite du user.
  const [flip, setFlip] = useState(null); // { dir, chanson, phase: "start" | "animating" }
  const flipTimeoutRef = useRef(null);

  function startFlip(dir, cardChanson) {
    if (flip || !cardChanson) return;
    setFlip({ dir, chanson: cardChanson, phase: "start" });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setFlip((f) => (f ? { ...f, phase: "animating" } : f));
      });
    });
    clearTimeout(flipTimeoutRef.current);
    flipTimeoutRef.current = setTimeout(() => setFlip(null), PAGE_TURN_TOTAL_DURATION_MS);
  }

  // Sur la toute première chanson de la session (pas encore d'historique),
  // back() ne fait rien plutôt que de sortir de l'écran (navigate(-1)) :
  // previous/next ne doivent jamais faire quitter le type d'objet
  // parcouru, cf. demande explicite du user.
  function goPrevious() {
    if (flip) return;
    const leaving = chanson;
    const moved = back();
    if (moved) startFlip("prev", leaving);
  }
  function goNext() {
    if (flip) return;
    startFlip("next", chanson);
    next();
  }

  const swipeHandlers = useSwipe({
    onSwipeLeft: goPrevious,
    onSwipeRight: goNext,
  });

  if (!chanson) return null;

  // `isFlipCopy` : la page "sortante" est dupliquée PAGE_TURN_STRIP_COUNT
  // fois (une par bande, cf. PageTurnCurl) — y monter un vrai <iframe>
  // YouTube à chaque fois chargerait 10 lecteurs simultanés pour une
  // animation qui ne dure qu'une fraction de seconde ; un simple encadré de
  // même taille suffit, la vidéo n'a de toute façon pas le temps d'être vue
  // pendant qu'elle pivote hors de l'écran.
  function renderChansonCard(cardChanson, isFlipCopy) {
    return (
      <div
        className="page-turn-card"
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--bg)",
          overflowY: "auto",
          backfaceVisibility: "hidden",
          boxSizing: "border-box",
          paddingBottom: "calc(var(--bottom-nav-height) * 2)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <h1 className="hebrew" style={{ margin: 0 }}>{cardChanson.title_he}</h1>
          {cardChanson.title_fr && (
            <p className="muted" style={{ margin: 0, fontStyle: "italic" }}>
              {cardChanson.title_fr}
            </p>
          )}
        </div>
        <hr style={{ border: "none", borderTop: "1px solid var(--cardBorder)", width: "100%", maxWidth: 320 }} />
        {isFlipCopy ? (
          <div style={{ width: 280, height: 158, borderRadius: 8, background: "var(--cardBg)" }} />
        ) : (
          <iframe
            width="280"
            height="158"
            src={youtubeEmbedUrl(cardChanson.url)}
            title={cardChanson.title_he}
            allowFullScreen
            style={{ border: "none", borderRadius: 8 }}
          />
        )}
        <hr style={{ border: "none", borderTop: "1px solid var(--cardBorder)", width: "100%", maxWidth: 320 }} />
        <div style={{ userSelect: "text" }}>
          {cardChanson.lyrics.map((vers) => (
            <div key={vers.index} style={{ marginBottom: "1.5em" }}>
              <p className="hebrew" style={{ margin: 0, fontSize: "1.3em" }}>{vers.hebrew}</p>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.871em" }}>{vers.french}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="screen" style={{ flex: 1 }} onPointerDown={swipeHandlers.onPointerDown}>
      <ActionHints {...swipeHandlers.hints} />
      <BottomNavBar onPrevious={goPrevious} onNext={goNext} />
      <div style={{ position: "relative", flex: 1, width: "100%", perspective: 1600, overflow: "hidden" }}>
        {renderChansonCard(chanson, false)}
        {flip && (
          <PageTurnCurl
            dir={flip.dir}
            phase={flip.phase}
            renderPage={() => renderChansonCard(flip.chanson, true)}
          />
        )}
      </div>
    </section>
  );
}
