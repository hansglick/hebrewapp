import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getLecon } from "../../api/content";
import "../screens.css";

export default function LeconDetailScreen() {
  const { chapId, code } = useParams();
  const [lecon, setLecon] = useState(null);

  useEffect(() => {
    getLecon(code).then(setLecon);
  }, [code]);

  if (!lecon) return null;

  return (
    <section className="screen">
      <h1>Leçon {code}</h1>
      <div className="tile-list">
        {lecon.text ? (
          <Link to={`/apprentissage/${chapId}/${code}/texte`} className="card-link">
            <div className="card">Texte</div>
          </Link>
        ) : (
          <div className="card" style={{ opacity: 0.5 }}>
            Texte (absent de cette leçon)
          </div>
        )}
        <div className="card" style={{ opacity: 0.5 }}>
          Verbes (à venir — Phase 4)
        </div>
        <div className="card" style={{ opacity: 0.5 }}>
          Mots (à venir — Phase 4)
        </div>
        <div className="card" style={{ opacity: 0.5 }}>
          Évaluation (à venir — Phases 4/7)
        </div>
      </div>
    </section>
  );
}
