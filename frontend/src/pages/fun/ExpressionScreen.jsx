import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { getRandomExpression } from "../../api/content";
import { mediaUrl } from "../../api/media";
import { useSwipe } from "../../hooks/useSwipe";
import { useRandomBrowser } from "../../hooks/useRandomBrowser";
import "../screens.css";

export default function ExpressionScreen() {
  const navigate = useNavigate();
  const [view, setView] = useState("image"); // image | detail
  const { current: expression, next, back } = useRandomBrowser(getRandomExpression);

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
