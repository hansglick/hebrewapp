import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getChapitres } from "../api/content";
import { ChapitreLabelWithLogo } from "../components/ChapitreLogo";
import "./screens.css";

// Bouton "Sauter des leçons" de l'écran Niveau : liste de tous les
// chapitres (pas de filtrage ici — un chapitre entièrement antérieur au
// niveau actuel affichera simplement une liste de leçons vide à l'étape
// suivante, cf. SauterLeconsScreen), cf. demande explicite du user.
// Distinct de /examen/sauter (demande d'équivalence), qui a son propre
// fonctionnement (portes d'entrée par chapitre, pas de filtrage par
// niveau).
export default function SauterLeconsChapitresScreen() {
  const [chapitres, setChapitres] = useState([]);

  useEffect(() => {
    getChapitres().then(setChapitres);
  }, []);

  return (
    <section className="screen">
      <h1>Sauter des leçons</h1>
      <div className="tile-list">
        {chapitres.map((chap) => (
          <Link key={chap.id} to={`/niveau/sauter/${chap.id}`} className="card-link">
            <div className="card">
              <ChapitreLabelWithLogo chapId={chap.id} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
