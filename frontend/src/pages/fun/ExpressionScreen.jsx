import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getRandomExpression } from "../../api/content";
import { mediaUrl } from "../../api/media";
import { useSwipe } from "../../hooks/useSwipe";
import "../screens.css";

export default function ExpressionScreen() {
  const navigate = useNavigate();
  const [expression, setExpression] = useState(null);
  const [view, setView] = useState("image"); // image | detail

  function loadRandom() {
    getRandomExpression().then(setExpression);
    setView("image");
  }

  useEffect(() => {
    loadRandom();
  }, []);

  const swipeHandlers = useSwipe({
    onSwipeLeft: () => {
      if (view === "image") loadRandom();
    },
    onSwipeRight: () => {
      if (view === "detail") setView("image");
      else navigate("/fun");
    },
  });

  if (!expression) return null;

  return (
    <section className="screen" {...swipeHandlers}>
      {view === "image" && (
        <img
          className="screen-image"
          src={mediaUrl(expression.imagepath)}
          alt={expression.hebreu_sans_nikud}
          draggable={false}
          onClick={() => setView("detail")}
        />
      )}

      {view === "detail" && (
        <>
          <h1 className="hebrew-large">{expression.hebreu_sans_nikud}</h1>
          <p className="muted">{expression.translitteration}</p>
          <p>{expression.traduction}</p>
          <p className="muted">{expression.contexte}</p>
        </>
      )}
    </section>
  );
}
