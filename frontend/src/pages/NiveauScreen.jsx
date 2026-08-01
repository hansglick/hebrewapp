import { useEffect, useState } from "react";
import { getNiveau } from "../api/user";
import "./screens.css";

export default function NiveauScreen() {
  const [niveau, setNiveau] = useState(null);

  useEffect(() => {
    getNiveau().then(setNiveau);
  }, []);

  if (!niveau) return null;

  return (
    <section className="screen">
      <h1>Niveau {niveau.level}</h1>
      <p className="muted">
        Bloqué à ce niveau depuis {niveau.jours_bloque} jour(s)
      </p>
      <div className="card" style={{ opacity: 0.5 }}>
        Passer le prochain examen (à venir — Phase 6)
      </div>
    </section>
  );
}
