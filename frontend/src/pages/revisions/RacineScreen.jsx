import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { getRacine, getRandomRacine } from "../../api/content";
import { mediaUrl } from "../../api/media";
import { useSwipe } from "../../hooks/useSwipe";
import { speak } from "../../utils/speech";
import { ActionHints } from "../../components/ActionHints";
import { BottomNavBar } from "../../components/BottomNavBar";
import "../screens.css";

// Accessible uniquement depuis le lien d'un mot (racine précise).
// Swipe droite : explore une autre racine aléatoire. Swipe gauche : retour
// à l'écran du mot d'origine (convention gauche=retour/historique, droite=
// aléatoire utilisée partout ailleurs dans l'app). Le mot exact quitté
// transite via location.state (returnPath/mot), posé par MotScreen, pour
// que le retour ne retombe pas sur un tirage aléatoire.
export default function RacineScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { shoresh } = useParams();
  const [racine, setRacine] = useState(null);

  useEffect(() => {
    getRacine(shoresh).then(setRacine);
  }, [shoresh]);

  function goPrevious() {
    const { returnPath, mot } = location.state ?? {};
    if (returnPath) {
      navigate(returnPath, { state: { restoreMot: mot } });
    } else {
      navigate(-1);
    }
  }
  function goNext() {
    getRandomRacine().then(setRacine);
  }

  const swipeHandlers = useSwipe({
    onSwipeLeft: goPrevious,
    onSwipeRight: goNext,
  });

  if (!racine) return null;

  return (
    <section className="screen" style={{ paddingBottom: 80 }} onPointerDown={swipeHandlers.onPointerDown}>
      <ActionHints {...swipeHandlers.hints} />
      <BottomNavBar onPrevious={goPrevious} onNext={goNext} />
      <div className="curiosite-split curiosite-split-racine">
        <div className="curiosite-media">
          <img
            className="screen-image"
            style={{ width: "100%" }}
            src={mediaUrl(racine.path)}
            alt={racine.shoresh}
            draggable={false}
          />
        </div>

        <div className="curiosite-content">
          <h1 className="hebrew-large">{racine.shoresh}</h1>
          <p className="muted">{racine.sens}</p>
          <ul className="words-list">
            {racine.words.map((w) => (
              <li key={w.hebrew} className="racine-word-row">
                <button type="button" className="speak-btn" onClick={() => speak(w.hebrew)}>
                  🔊
                </button>
                <div>
                  <p className="hebrew" style={{ margin: 0 }}>
                    {w.hebrew}
                  </p>
                  <p className="muted" style={{ margin: "2px 0 0" }}>
                    {w.french}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
