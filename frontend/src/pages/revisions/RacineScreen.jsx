import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getRacine, getRandomRacine } from "../../api/content";
import { mediaUrl } from "../../api/media";
import { useSwipe } from "../../hooks/useSwipe";
import "../screens.css";

export default function RacineScreen() {
  const navigate = useNavigate();
  const { shoresh } = useParams(); // présent si on arrive sur une racine précise (ex: depuis un mot)
  const [racine, setRacine] = useState(null);
  const [view, setView] = useState("main"); // main | detail

  function loadRandom() {
    getRandomRacine().then(setRacine);
    setView("main");
  }

  useEffect(() => {
    if (shoresh) {
      getRacine(shoresh).then(setRacine);
      setView("main");
    } else {
      loadRandom();
    }
  }, [shoresh]);

  const swipeHandlers = useSwipe({
    onSwipeLeft: () => {
      if (view === "main") loadRandom();
    },
    onSwipeRight: () => {
      if (view === "main") navigate(-1);
    },
  });

  if (!racine) return null;

  return (
    <section className="screen" {...swipeHandlers}>
      {view === "main" && (
        <>
          <img
            className="screen-image"
            src={mediaUrl(racine.path)}
            alt={racine.shoresh}
            draggable={false}
          />
          <h1 className="hebrew-large">{racine.shoresh}</h1>
          <button type="button" className="link-btn" onClick={() => setView("detail")}>
            en savoir plus
          </button>
        </>
      )}

      {view === "detail" && (
        <>
          <h1 className="hebrew-large">{racine.shoresh}</h1>
          <p className="muted">{racine.sens}</p>
          <ul className="words-list">
            {racine.words.map((w) => (
              <li key={w.hebrew} className="hebrew">
                {w.hebrew} ({w.french})
              </li>
            ))}
          </ul>
          <button type="button" className="link-btn" onClick={() => setView("main")}>
            retour
          </button>
        </>
      )}
    </section>
  );
}
