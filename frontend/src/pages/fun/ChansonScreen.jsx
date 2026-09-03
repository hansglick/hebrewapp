import { useLocation } from "react-router-dom";
import { getRandomChanson } from "../../api/content";
import { youtubeEmbedUrl } from "../../api/media";
import { useSwipe } from "../../hooks/useSwipe";
import { useRandomBrowser } from "../../hooks/useRandomBrowser";
import { ActionHints } from "../../components/ActionHints";
import { BottomNavBar } from "../../components/BottomNavBar";
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

  // Sur la toute première chanson de la session (pas encore d'historique),
  // back() ne fait rien plutôt que de sortir de l'écran (navigate(-1)) :
  // previous/next ne doivent jamais faire quitter le type d'objet
  // parcouru, cf. demande explicite du user.
  function goPrevious() {
    back();
  }
  function goNext() {
    next();
  }

  const swipeHandlers = useSwipe({
    onSwipeLeft: goPrevious,
    onSwipeRight: goNext,
  });

  if (!chanson) return null;

  return (
    <section className="screen" style={{ paddingBottom: "calc(var(--bottom-nav-height) * 2)" }} onPointerDown={swipeHandlers.onPointerDown}>
      <ActionHints {...swipeHandlers.hints} />
      <BottomNavBar onPrevious={goPrevious} onNext={goNext} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <h1 className="hebrew" style={{ margin: 0 }}>{chanson.title_he}</h1>
        {chanson.title_fr && (
          <p className="muted" style={{ margin: 0, fontStyle: "italic" }}>
            {chanson.title_fr}
          </p>
        )}
      </div>
      <hr style={{ border: "none", borderTop: "1px solid var(--border)", width: "100%", maxWidth: 320 }} />
      <iframe
        width="280"
        height="158"
        src={youtubeEmbedUrl(chanson.url)}
        title={chanson.title_he}
        allowFullScreen
        style={{ border: "none", borderRadius: 8 }}
      />
      <hr style={{ border: "none", borderTop: "1px solid var(--border)", width: "100%", maxWidth: 320 }} />
      <div style={{ userSelect: "text" }}>
        {chanson.lyrics.map((vers) => (
          <div key={vers.index} style={{ marginBottom: "1.5em" }}>
            <p className="hebrew" style={{ margin: 0, fontSize: "1.3em" }}>{vers.hebrew}</p>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.871em" }}>{vers.french}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
