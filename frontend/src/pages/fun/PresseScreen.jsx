import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { getRandomPresse } from "../../api/content";
import { mediaUrl } from "../../api/media";
import { useSwipe } from "../../hooks/useSwipe";
import { useRandomBrowser } from "../../hooks/useRandomBrowser";
import "../screens.css";

export default function PresseScreen() {
  const navigate = useNavigate();
  const [view, setView] = useState("image"); // image | detail
  const { current: presse, next, back } = useRandomBrowser(getRandomPresse);

  const swipeHandlers = useSwipe({
    onSwipeLeft: () => {
      if (view === "detail") setView("image");
      else if (!back()) navigate(-1);
    },
    onSwipeRight: () => {
      if (view === "image") next();
    },
    onSpace: () => {
      if (view === "image") setView("detail");
    },
  });

  if (!presse) return null;

  return (
    <section className="screen" {...swipeHandlers}>
      {view === "image" && (
        <img
          className="screen-image"
          src={mediaUrl(presse.imagepath)}
          alt={presse.title_french}
          draggable={false}
          onClick={() => setView("detail")}
        />
      )}

      {view === "detail" && (
        <>
          <h1 className="hebrew-large">{presse.title_hebrew}</h1>
          <p className="muted hebrew">{presse.chapeau_hebrew}</p>
          <h2>{presse.title_french}</h2>
          <p className="muted">{presse.chapeau_french}</p>
        </>
      )}
    </section>
  );
}
