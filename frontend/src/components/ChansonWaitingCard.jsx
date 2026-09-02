import { getRandomChanson } from "../api/content";
import { youtubeEmbedUrl } from "../api/media";
import { useRandomBrowser } from "../hooks/useRandomBrowser";
import { useSwipe } from "../hooks/useSwipe";

// Chanson aléatoire (vidéo YouTube + paroles hébreu/français) affichée dans
// un encadré compact pendant l'attente d'une correction Gemini, en
// alternative à la vidéo d'attente muette (cf. WaitingVideo, qui bascule
// vers ce composant sur clic de "Patienter en chansons"). La vidéo se
// relance automatiquement à chaque nouvelle chanson tirée (next(), swipe ou
// bouton "Suivant") — `key={chanson.url}` sur l'iframe force un vrai
// remount pour que `autoplay=1` reparte à chaque fois, un simple changement
// de `src` sur le même élément n'étant pas garanti de le faire.
export function ChansonWaitingCard() {
  const { current: chanson, next } = useRandomBrowser(getRandomChanson);
  const swipeHandlers = useSwipe({ onSwipeLeft: next, onSwipeRight: next });

  if (!chanson) return null;

  return (
    <div className="card" style={{ textAlign: "center" }} onPointerDown={swipeHandlers.onPointerDown}>
      <h2 className="hebrew" style={{ margin: 0, fontSize: "1.1em" }}>
        {chanson.title_he}
      </h2>
      {chanson.title_fr && (
        <p className="muted" style={{ margin: "2px 0 10px", fontStyle: "italic", fontSize: "0.8em" }}>
          {chanson.title_fr}
        </p>
      )}
      <iframe
        key={chanson.url}
        width="280"
        height="158"
        src={`${youtubeEmbedUrl(chanson.url)}?autoplay=1`}
        title={chanson.title_he}
        allow="autoplay; encrypted-media"
        allowFullScreen
        style={{ border: "none", borderRadius: 8, display: "block", margin: "0 auto" }}
      />
      <div
        style={{
          maxHeight: 150,
          overflowY: "auto",
          textAlign: "start",
          margin: "10px 0",
          userSelect: "text",
        }}
      >
        {chanson.lyrics.map((vers) => (
          <div key={vers.index} style={{ marginBottom: "0.7em" }}>
            <p className="hebrew" style={{ margin: 0, fontSize: "0.85em" }}>
              {vers.hebrew}
            </p>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: "0.6em" }}>
              {vers.french}
            </p>
          </div>
        ))}
      </div>
      <button type="button" className="link-btn" onClick={next}>
        Suivant →
      </button>
    </div>
  );
}
