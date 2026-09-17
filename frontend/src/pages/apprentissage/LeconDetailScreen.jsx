import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getLecon, getLeconExploration, getLessonCuriosites } from "../../api/content";
import { displayLessonNumber } from "../../utils/lessonDisplay";
import { displayChapitreLabel } from "../../utils/chapitreDisplay";
import { TileTitle } from "../../components/TileTitle";
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

  // Cercle en blanc les tuiles ayant du contenu mais jamais visitées
  // (aucun item de cette catégorie n'a encore été vu, cf. object_views) —
  // cf. demande explicite du user (auparavant rouge).
  function notVisitedStyle(category) {
    const c = exploration?.categories?.[category];
    if (!c || c.total === 0 || c.seen > 0) return undefined;
    return { border: "2px solid #fff" };
  }

  return (
    <section className="screen">
      {/* .card partage déjà width:100%/max-width:320px avec .tile-list
          (screens.css) — même largeur que les tuiles ci-dessous sans
          wrapper supplémentaire ; fond/bordure rendus invisibles ici — cf.
          demande explicite du user. */}
      <div className="card" style={{ background: "transparent", border: "none", textAlign: "center" }}>
        {/* -33% (2em * 0.67 = 1.34em) ; non gras sauf le niveau — cf.
            demande explicite du user. */}
        <h1 style={{ margin: 0, fontSize: "0.938em", fontWeight: 400, fontStyle: "italic" }}>
          Matériel pédagogique de la leçon{" "}
          <strong style={{ fontWeight: 600, fontStyle: "normal" }}>
            {displayChapitreLabel(chapId)}.{displayLessonNumber(code)}
          </strong>
        </h1>
      </div>

      <div className="tile-list">
        {lecon.text && (
          <Link to={`/apprentissage/${chapId}/${code}/texte`} className="card-link">
            <div className="card" style={{ textAlign: "center", ...notVisitedStyle("texte") }}>
              <TileTitle src="/textlogo.png" gap={20}>Texte</TileTitle>
            </div>
          </Link>
        )}
        {lecon.words.length > 0 && (
          <Link to={`/apprentissage/${chapId}/${code}/mots`} className="card-link">
            <div className="card" style={{ textAlign: "center", ...notVisitedStyle("mots") }}>
              <TileTitle src="/alefletter.png" gap={20}>Vocabulaire</TileTitle>
            </div>
          </Link>
        )}
        {lecon.verbs.length > 0 && (
          <Link to={`/apprentissage/${chapId}/${code}/verbes`} className="card-link">
            <div className="card" style={{ textAlign: "center", ...notVisitedStyle("verbes") }}>
              <TileTitle src="/menorah.svg" gap={20}>Verbes</TileTitle>
            </div>
          </Link>
        )}
        {lecon.phrases && (
          <Link to={`/apprentissage/${chapId}/${code}/questions-ecrites`} className="card-link">
            <div className="card" style={{ textAlign: "center", ...notVisitedStyle("traductions") }}>
              <TileTitle src="/traduction.png" gap={20}>Traductions</TileTitle>
            </div>
          </Link>
        )}
        {/* Remplace l'ancienne tuile "Coin culture" (liste de tuiles, cf.
            CuriositeListScreen) — seule la variante "image map" (cf.
            CoinCultureFastScreen) reste proposée ici, désormais sous le
            nom "Coin culture" — cf. demande explicite du user. */}
        {hasCuriosite && (
          <Link to={`/apprentissage/${chapId}/${code}/curiosite-fast`} className="card-link">
            <div className="card" style={{ textAlign: "center", ...notVisitedStyle("curiosite") }}>
              {/* Même logo (toupie) que le portail Culture du bandeau
                  desktop — cf. DreidelIcon.jsx, demande explicite du user. */}
              <TileTitle src="/dreidel.png" gap={20}>Coin culture</TileTitle>
            </div>
          </Link>
        )}
      </div>
    </section>
  );
}
