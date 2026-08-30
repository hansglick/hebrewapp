import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getChapitres } from "../../api/content";
import { ChapitreLabelWithLogo } from "../../components/ChapitreLogo";
import "../screens.css";

export default function ChapitresListScreen() {
  const [chapitres, setChapitres] = useState([]);

  useEffect(() => {
    getChapitres().then(setChapitres);
  }, []);

  return (
    <section className="screen">
      <h1>Apprentissage</h1>
      <div className="tile-list">
        {chapitres.map((chap) => (
          <div key={chap.id} className="card">
            <div className="card-row" style={{ justifyContent: "center" }}>
              <Link to={`/apprentissage/${chap.id}`} className="card-link" style={{ width: "100%" }}>
                <ChapitreLabelWithLogo chapId={chap.id} />
              </Link>
            </div>
            <div className="card-details">
              <strong>{chap.titre}</strong>
              <span>{chap.presentation}</span>
              <span>{chap.nb_lessons} leçon(s)</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
