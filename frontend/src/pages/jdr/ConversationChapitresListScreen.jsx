import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getChapitres } from "../../api/content";
import { ChapitreLabelWithLogo } from "../../components/ChapitreLogo";
import "../screens.css";

// Même parcours que ChapitresListScreen (apprentissage), mais chaque
// chapitre mène à la liste de ses conversations (JDR) plutôt qu'à ses
// leçons — cf. ConversationLeconsListScreen pour le filtrage par niveau.
export default function ConversationChapitresListScreen() {
  const [chapitres, setChapitres] = useState([]);

  useEffect(() => {
    getChapitres().then(setChapitres);
  }, []);

  return (
    <section className="screen">
      <h1>Conversations précédentes</h1>
      <div className="tile-list">
        {chapitres.map((chap) => (
          <div key={chap.id} className="card">
            <div className="card-row" style={{ justifyContent: "center" }}>
              <Link to={`/jdr/chapitre/${chap.id}`} className="card-link" style={{ width: "100%" }}>
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
