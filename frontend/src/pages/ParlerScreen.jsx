import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getNiveau } from "../api/user";
import "./screens.css";

// Écran de choix atteint depuis la tuile "Parler" de l'accueil : conversation
// guidée (RevisionScreen, "Révise avec ton professeur") vs jeu de rôle (JDR),
// chacune avec son propre accès aux leçons précédentes juste en dessous,
// cf. demande explicite du user.
export default function ParlerScreen() {
  const [niveau, setNiveau] = useState(null);

  useEffect(() => {
    getNiveau().then(setNiveau);
  }, []);

  if (!niveau) return null;
  const referenceLesson = niveau.reference_lesson;

  return (
    <section className="screen">
      <h1>Parler</h1>
      <div className="tile-list">
        {referenceLesson && (
          <Link to={`/revision-prof/${referenceLesson}`} className="card-link">
            <div className="card" style={{ textAlign: "center", fontWeight: 600, fontSize: "1.1em" }}>
              Conversation guidée
            </div>
          </Link>
        )}
        <Link
          to="/revision-prof"
          className="link-btn"
          style={{ textAlign: "center", border: "none", background: "none", padding: 0 }}
        >
          Rejouer les conversations précédentes
        </Link>

        {referenceLesson && (
          <Link to={`/jdr/${referenceLesson}`} className="card-link" style={{ marginTop: 16 }}>
            <div className="card" style={{ textAlign: "center", fontWeight: 600, fontSize: "1.1em" }}>
              Jeu de rôle
            </div>
          </Link>
        )}
        <Link
          to="/jdr"
          className="link-btn"
          style={{ textAlign: "center", border: "none", background: "none", padding: 0 }}
        >
          Rejouer les conversations précédentes
        </Link>
      </div>
    </section>
  );
}
