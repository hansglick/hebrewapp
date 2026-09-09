import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getChapitres } from "../../api/content";
import { getNiveau } from "../../api/user";
import { ChapitreLabelWithLogo } from "../../components/ChapitreLogo";
import "../screens.css";

// Point d'entrée de la Bibliothèque (icône desktop uniquement, cf.
// LibraryIcon/Layout.jsx) : chapitres déjà atteints par le user (un
// chapitre est "atteint" dès que sa toute première leçon est débloquée,
// même comparaison numérique que la leçon de référence) — cf. demande
// explicite du user. Contrairement à ChapitresListScreen (apprentissage),
// aucun chapitre verrouillé n'est listé ici.
export default function LibraryChapitresScreen() {
  const [chapitres, setChapitres] = useState([]);
  const [niveau, setNiveau] = useState(null);

  useEffect(() => {
    getChapitres().then(setChapitres);
    getNiveau().then(setNiveau);
  }, []);

  if (!niveau) return null;

  const referenceChapId = niveau.reference_lesson ? parseInt(niveau.reference_lesson.split(".")[0], 10) : 0;
  const reached = chapitres.filter((chap) => parseInt(chap.id, 10) <= referenceChapId);

  return (
    <section className="screen">
      <h1>Bibliothèque</h1>
      <p className="muted" style={{ textAlign: "center" }}>
        Explorez les leçons précédentes
      </p>
      <div className="tile-list">
        {reached.map((chap) => (
          <Link key={chap.id} to={`/library/${chap.id}`} className="card-link">
            <div className="card">
              <ChapitreLabelWithLogo chapId={chap.id} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
