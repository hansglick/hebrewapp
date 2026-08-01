import { useNavigate } from "react-router-dom";
import { getRandomChanson } from "../../api/content";
import { youtubeEmbedUrl } from "../../api/media";
import { useSwipe } from "../../hooks/useSwipe";
import { useRandomBrowser } from "../../hooks/useRandomBrowser";
import "../screens.css";

export default function ChansonScreen() {
  const navigate = useNavigate();
  const { current: chanson, next, back } = useRandomBrowser(getRandomChanson);

  const swipeHandlers = useSwipe({
    onSwipeLeft: () => {
      if (!back()) navigate(-1);
    },
    onSwipeRight: () => next(),
  });

  if (!chanson) return null;

  return (
    <section className="screen" {...swipeHandlers}>
      <h1 className="hebrew">{chanson.titre}</h1>
      <iframe
        width="280"
        height="158"
        src={youtubeEmbedUrl(chanson.lien_youtube)}
        title={chanson.titre}
        allowFullScreen
        style={{ border: "none", borderRadius: 8 }}
      />
      <div>
        {chanson.paroles.map((vers) => (
          <div key={vers.index} style={{ marginBottom: 12 }}>
            <p className="hebrew">{vers.hebrew}</p>
            <p className="muted">{vers.french}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
