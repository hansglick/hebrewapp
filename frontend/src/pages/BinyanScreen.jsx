import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getBinyans } from "../api/content";
import { useSwipe } from "../hooks/useSwipe";
import { ActionHints } from "../components/ActionHints";
import "./screens.css";

export default function BinyanScreen() {
  const navigate = useNavigate();
  const { nom } = useParams(); // binyan affiché (depuis la pastille d'un verbe)
  const [binyans, setBinyans] = useState(null);

  useEffect(() => {
    getBinyans().then(setBinyans);
  }, []);

  // Seule action disponible : retour à la fiche verbe d'origine.
  const swipeHandlers = useSwipe({
    onSwipeLeft: () => navigate(-1),
  });

  if (!binyans) return null;

  const binyan = binyans[nom];

  return (
    <section className="screen" onPointerDown={swipeHandlers.onPointerDown}>
      <ActionHints {...swipeHandlers.hints} />
      <h1 className="hebrew-large">
        {binyan.text}
        <span className="binyan-pill" style={{ backgroundColor: binyan.color }} />
      </h1>
      <p className="muted">{binyan.phonetique}</p>
      <p>{binyan.sens}</p>
    </section>
  );
}
