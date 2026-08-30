import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getLecon, getLeconExploration, getLessonCuriosites } from "../../api/content";
import { displayLessonNumber } from "../../utils/lessonDisplay";
import { leconProgressMessage } from "../../utils/leconProgressMessage";
import { ChapitreLogo } from "../../components/ChapitreLogo";
import { ProgressBar } from "../../components/ProgressBar";
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

  const percent = exploration && exploration.total > 0 ? (100 * exploration.seen) / exploration.total : 0;
  const { color, message } = leconProgressMessage(percent);

  // Cercle en rouge les tuiles ayant du contenu mais jamais visitées
  // (aucun item de cette catégorie n'a encore été vu, cf. object_views).
  function notVisitedStyle(category) {
    const c = exploration?.categories?.[category];
    if (!c || c.total === 0 || c.seen > 0) return undefined;
    return { border: "2px solid var(--danger)" };
  }

  return (
    <section className="screen">
      <h1
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.01em",
        }}
      >
        <ChapitreLogo chapId={chapId} size="5.2em" style={{ marginInlineStart: 0 }} />
        <span>{displayLessonNumber(code)}</span>
      </h1>

      {exploration && (
        <div
          style={{
            width: "100%",
            maxWidth: 320,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            alignItems: "center",
          }}
        >
          <span style={{ fontWeight: 600, fontSize: "0.9em" }}>{Math.ceil(percent)}%</span>
          <ProgressBar value={percent} color={color} />
          <p className="muted" style={{ margin: 0, textAlign: "center" }}>
            {message}
          </p>
        </div>
      )}

      <div className="tile-list">
        {lecon.text ? (
          <Link to={`/apprentissage/${chapId}/${code}/texte`} className="card-link">
            <div className="card" style={notVisitedStyle("texte")}>
              Texte
            </div>
          </Link>
        ) : (
          <div className="card" style={{ opacity: 0.5 }}>
            Texte (absent de cette leçon)
          </div>
        )}
        {lecon.verbs.length > 0 ? (
          <Link to={`/apprentissage/${chapId}/${code}/verbes`} className="card-link">
            <div className="card" style={notVisitedStyle("verbes")}>
              Verbes
            </div>
          </Link>
        ) : (
          <div className="card" style={{ opacity: 0.5 }}>
            Verbes (absents de cette leçon)
          </div>
        )}
        {lecon.words.length > 0 ? (
          <Link to={`/apprentissage/${chapId}/${code}/mots`} className="card-link">
            <div className="card" style={notVisitedStyle("mots")}>
              Mots
            </div>
          </Link>
        ) : (
          <div className="card" style={{ opacity: 0.5 }}>
            Mots (absents de cette leçon)
          </div>
        )}
        {lecon.phrases ? (
          <Link to={`/apprentissage/${chapId}/${code}/questions-ecrites`} className="card-link">
            <div className="card" style={notVisitedStyle("traductions")}>
              Traductions
            </div>
          </Link>
        ) : (
          <div className="card" style={{ opacity: 0.5 }}>
            Traductions (aucune phrase pour cette leçon)
          </div>
        )}
        {lecon.text && lecon.has_oral_questions ? (
          <Link to={`/apprentissage/${chapId}/${code}/questions-orales`} className="card-link">
            <div className="card" style={notVisitedStyle("oral")}>
              Oral
            </div>
          </Link>
        ) : (
          <div className="card" style={{ opacity: 0.5 }}>
            Oral{" "}
            {lecon.text ? "(aucune question orale pour ce texte)" : "(aucun texte pour cette leçon)"}
          </div>
        )}
        <Link to={`/apprentissage/${chapId}/${code}/pdf`} className="card-link">
          <div className="card">PDF</div>
        </Link>
        {hasCuriosite && (
          <Link to={`/apprentissage/${chapId}/${code}/curiosite`} className="card-link">
            <div className="card">Curiosité</div>
          </Link>
        )}
      </div>
    </section>
  );
}
