import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getChapitres } from "../../api/content";
import { ChapitreLabelWithLogo } from "../../components/ChapitreLogo";
import "../screens.css";

// Liste des chapitres dans l'ordre croissant de difficulté (= ordre du
// cours) — cliquer sur un chapitre mène à la liste de ses examens
// (ExamenSauterChapitreScreen).
export default function ExamenSauterScreen() {
  const [chapitres, setChapitres] = useState([]);

  useEffect(() => {
    getChapitres().then(setChapitres);
  }, []);

  return (
    <section className="screen">
      <h1>Demander une équivalence ou repasser un examen réussi</h1>
      <div className="tile-list">
        {chapitres.map((chap) => (
          <Link key={chap.id} to={`/examen/sauter/${chap.id}`} className="card-link">
            <div className="card">
              <ChapitreLabelWithLogo chapId={chap.id} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
