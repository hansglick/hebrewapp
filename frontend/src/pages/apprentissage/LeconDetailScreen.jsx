import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getLecon, getLeconExploration, getLessonCuriosites } from "../../api/content";
import { displayLessonNumber } from "../../utils/lessonDisplay";
import { displayChapitreLabel } from "../../utils/chapitreDisplay";
import "../screens.css";

export default function LeconDetailScreen() {
  const { chapId, code } = useParams();
  const [lecon, setLecon] = useState(null);
  const [hasCuriosite, setHasCuriosite] = useState(false);
  const [exploration, setExploration] = useState(null);

  useEffect(() => {
    getLecon(code).then(setLecon);
    getLessonCuriosites(code).then((data) => setHasCuriosite(data.types.length > 0));
    getLeconExploration(code).then(setExploration);
  }, [code]);

  if (!lecon) return null;

  // Cercle en rouge les tuiles ayant du contenu mais jamais visitées
  // (aucun item de cette catégorie n'a encore été vu, cf. object_views).
  function notVisitedStyle(category) {
    const c = exploration?.categories?.[category];
    if (!c || c.total === 0 || c.seen > 0) return undefined;
    return { border: "2px solid var(--annulationPleine)" };
  }

  return (
    <section className="screen">
      <h1>
        Leçon {displayChapitreLabel(chapId)}.{displayLessonNumber(code)}
      </h1>

      <div className="tile-list">
        {lecon.text && (
          <Link to={`/apprentissage/${chapId}/${code}/texte`} className="card-link">
            <div className="card" style={notVisitedStyle("texte")}>
              Texte
            </div>
          </Link>
        )}
        {lecon.words.length > 0 && (
          <Link to={`/apprentissage/${chapId}/${code}/mots`} className="card-link">
            <div className="card" style={notVisitedStyle("mots")}>
              Vocabulaire
            </div>
          </Link>
        )}
        {lecon.verbs.length > 0 && (
          <Link to={`/apprentissage/${chapId}/${code}/verbes`} className="card-link">
            <div className="card" style={notVisitedStyle("verbes")}>
              Verbes
            </div>
          </Link>
        )}
        {lecon.phrases && (
          <Link to={`/apprentissage/${chapId}/${code}/questions-ecrites`} className="card-link">
            <div className="card" style={notVisitedStyle("traductions")}>
              Traductions
            </div>
          </Link>
        )}
        {hasCuriosite && (
          <Link to={`/apprentissage/${chapId}/${code}/curiosite`} className="card-link">
            <div className="card">Coin culture</div>
          </Link>
        )}
        {/* Variante "image map" (cf. CoinCultureFastScreen) ajoutée EN PLUS
            de la tuile "Coin culture" existante, sans la remplacer pour le
            moment — cf. demande explicite du user. */}
        {hasCuriosite && (
          <Link to={`/apprentissage/${chapId}/${code}/curiosite-fast`} className="card-link">
            <div className="card">Coin culture fast</div>
          </Link>
        )}
      </div>
    </section>
  );
}
