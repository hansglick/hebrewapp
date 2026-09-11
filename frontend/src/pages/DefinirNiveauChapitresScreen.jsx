import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getChapitres } from "../api/content";
import { ChapitreLabelWithLogo } from "../components/ChapitreLogo";
import "./screens.css";

// Bouton "Définir son niveau" de l'écran Niveau (God Mode uniquement) :
// liste de tous les chapitres, même gabarit que "Sauter des leçons" (cf.
// SauterLeconsChapitresScreen) — pas de filtrage ici non plus, cf. demande
// explicite du user.
export default function DefinirNiveauChapitresScreen() {
  const [chapitres, setChapitres] = useState([]);

  useEffect(() => {
    getChapitres().then(setChapitres);
  }, []);

  return (
    <section className="screen">
      <h1>Définir son niveau</h1>
      <div className="tile-list">
        {chapitres.map((chap) => (
          <Link key={chap.id} to={`/niveau/definir/${chap.id}`} className="card-link">
            <div className="card">
              <ChapitreLabelWithLogo chapId={chap.id} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
