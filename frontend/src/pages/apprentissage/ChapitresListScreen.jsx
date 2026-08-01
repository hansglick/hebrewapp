import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getChapitres } from "../../api/content";
import "../screens.css";

export default function ChapitresListScreen() {
  const [chapitres, setChapitres] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    getChapitres().then(setChapitres);
  }, []);

  return (
    <section className="screen">
      <h1>Apprentissage</h1>
      <div className="tile-list">
        {chapitres.map((chap) => (
          <div key={chap.id} className="card">
            <div className="card-row">
              <Link to={`/apprentissage/${chap.id}`} className="card-link">
                Chapitre {chap.id}
              </Link>
              <button
                type="button"
                className="link-btn"
                onClick={() =>
                  setExpandedId(expandedId === chap.id ? null : chap.id)
                }
              >
                en savoir plus
              </button>
            </div>
            {expandedId === chap.id && (
              <div className="card-details">
                <strong>{chap.titre}</strong>
                <span>{chap.presentation}</span>
                <span>{chap.nb_lessons} leçon(s)</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
