import { useLocation, useNavigate } from "react-router-dom";
import { getRandomChanson } from "../../api/content";
import { youtubeEmbedUrl } from "../../api/media";
import { useSwipe } from "../../hooks/useSwipe";
import { useRandomBrowser } from "../../hooks/useRandomBrowser";
import { ActionHints } from "../../components/ActionHints";
import "../screens.css";

export default function ChansonScreen() {
  const navigate = useNavigate();
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

  const swipeHandlers = useSwipe({
    onSwipeLeft: () => {
      if (!back()) navigate(-1);
    },
    onSwipeRight: () => next(),
  });

  if (!chanson) return null;

  return (
    <section className="screen" onPointerDown={swipeHandlers.onPointerDown}>
      <ActionHints {...swipeHandlers.hints} />
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
