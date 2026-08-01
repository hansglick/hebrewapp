import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getBinyans } from "../api/content";
import { useSwipe } from "../hooks/useSwipe";
import "./screens.css";

export default function BinyanScreen() {
  const navigate = useNavigate();
  const [binyans, setBinyans] = useState(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    getBinyans().then((data) => {
      setBinyans({ names: Object.keys(data), data });
    });
  }, []);

  const swipeHandlers = useSwipe({
    onSwipeLeft: () => {
      setIndex((i) => (binyans ? (i + 1) % binyans.names.length : i));
    },
    onSwipeRight: () => navigate(-1),
  });

  if (!binyans) return null;

  const nom = binyans.names[index];
  const binyan = binyans.data[nom];

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
