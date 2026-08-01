import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getBinyans } from "../api/content";
import { useSwipe } from "../hooks/useSwipe";
import "./screens.css";

export default function BinyanScreen() {
  const navigate = useNavigate();
  const { nom } = useParams(); // optionnel : binyan de départ (ex: depuis la pastille d'un verbe)
  const [binyans, setBinyans] = useState(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    getBinyans().then((data) => {
      const names = Object.keys(data);
      const startIndex = nom ? Math.max(names.indexOf(nom), 0) : 0;
      setBinyans({ names, data });
      setIndex(startIndex);
    });
  }, [nom]);

  const swipeHandlers = useSwipe({
    onSwipeLeft: () => {
      setIndex((i) => (binyans ? (i + 1) % binyans.names.length : i));
    },
    onSwipeRight: () => navigate(-1),
  });

  if (!binyans) return null;

  const currentNom = binyans.names[index];
  const binyan = binyans.data[currentNom];

  return (
    <section className="screen" {...swipeHandlers}>
      <h1 className="hebrew-large">
        {binyan.text}
        <span className="binyan-pill" style={{ backgroundColor: binyan.color }} />
      </h1>
      <p className="muted">{binyan.phonetique}</p>
      <p>{binyan.sens}</p>
    </section>
  );
}
