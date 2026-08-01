import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getRandomChanson } from "../../api/content";
import { youtubeEmbedUrl } from "../../api/media";
import { useSwipe } from "../../hooks/useSwipe";
import "../screens.css";

export default function ChansonScreen() {
  const navigate = useNavigate();
  const [chanson, setChanson] = useState(null);

  function loadRandom() {
    getRandomChanson().then(setChanson);
  }

  useEffect(() => {
    loadRandom();
  }, []);

  const swipeHandlers = useSwipe({
    onSwipeLeft: loadRandom,
    onSwipeRight: () => navigate("/fun"),
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
