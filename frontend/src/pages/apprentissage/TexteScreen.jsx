import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getTexte } from "../../api/content";
import { mediaUrl } from "../../api/media";
import { useSwipe } from "../../hooks/useSwipe";
import "../screens.css";

export default function TexteScreen() {
  const { chapId, code } = useParams();
  const navigate = useNavigate();
  const [texte, setTexte] = useState(null);
  const [view, setView] = useState("image"); // image | hebrew | french
  const audioRef = useRef(null);

  useEffect(() => {
    getTexte(code).then(setTexte);
    setView("image");
  }, [code]);

  const swipeHandlers = useSwipe({
    onSwipeRight: () => {
      if (view === "french") setView("hebrew");
      else if (view === "hebrew") setView("image");
      else navigate(`/apprentissage/${chapId}/${code}`);
    },
  });

  if (!texte) return null;

  return (
    <section className="screen" {...swipeHandlers}>
      {view === "image" && (
        <>
          <img
            className="screen-image"
            src={mediaUrl(texte.imagepath)}
            alt={texte.title}
            draggable={false}
          />
          <h1 className="hebrew">{texte.title}</h1>
          <p className="muted">({texte.lesson})</p>
          <button type="button" className="link-btn" onClick={() => setView("hebrew")}>
            lire
          </button>
        </>
      )}

      {view === "hebrew" && (
        <>
          <p className="hebrew-large">{texte.text}</p>
          <button
            type="button"
            className="link-btn"
            onClick={() => audioRef.current?.play()}
          >
            🔊 écouter
          </button>
          <audio ref={audioRef} src={mediaUrl(texte.voicepath)} />
          <button type="button" className="link-btn" onClick={() => setView("french")}>
            traduction
          </button>
        </>
      )}

      {view === "french" && (
        <div>
          {texte.phrases.map((phrase) => (
            <p key={phrase.index}>{phrase.french}</p>
          ))}
        </div>
      )}
    </section>
  );
}
