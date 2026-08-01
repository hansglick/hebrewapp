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
        {lecon.verbs.length > 0 ? (
          <Link to={`/apprentissage/${chapId}/${code}/verbes`} className="card-link">
            <div className="card">Verbes</div>
          </Link>
        ) : (
          <div className="card" style={{ opacity: 0.5 }}>
            Verbes (absents de cette leçon)
          </div>
        )}
        {lecon.words.length > 0 ? (
          <Link to={`/apprentissage/${chapId}/${code}/mots`} className="card-link">
            <div className="card">Mots</div>
          </Link>
        ) : (
          <div className="card" style={{ opacity: 0.5 }}>
            Mots (absents de cette leçon)
          </div>
        )}
        {lecon.phrases ? (
          <Link to={`/apprentissage/${chapId}/${code}/evaluation`} className="card-link">
            <div className="card">Évaluation</div>
          </Link>
        ) : (
          <div className="card" style={{ opacity: 0.5 }}>
            Évaluation (aucune phrase pour cette leçon)
          </div>
        )}
      </div>
    </section>
  );
}
