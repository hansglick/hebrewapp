import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getNiveau } from "../api/user";
import { getLecon } from "../api/content";
import "./screens.css";

// Écran de choix atteint depuis la tuile "Parler" de l'accueil :
// compréhension (questions orales, cf. QuestionOraleScreen en mode
// exploration/tirage linéaire bouclé) / conversation guidée (RevisionScreen,
// "Révise avec ton professeur") / jeu de rôle (JDR).
export default function ParlerScreen() {
  const [niveau, setNiveau] = useState(null);
  const [lecon, setLecon] = useState(null);

  useEffect(() => {
    getNiveau().then(setNiveau);
  }, []);

  // Sert à griser la tuile "Compréhension" si la leçon de référence n'a pas
  // de questions orales associées (cf. lecon.has_oral_questions, backend) —
  // cf. demande explicite du user.
  useEffect(() => {
    if (niveau?.reference_lesson) getLecon(niveau.reference_lesson).then(setLecon);
  }, [niveau]);

  if (!niveau) return null;
  const referenceLesson = niveau.reference_lesson;

  return (
    <section className="screen">
      <h1>Parler</h1>
      <div className="tile-list">
        {/* Avant "Compréhension" — cf. demande explicite du user. Grisée
            (non cliquable) si la leçon n'introduit aucun concept
            grammatical (item_concept.json, champ "presence"), même
            gating que "Compréhension" ci-dessous. */}
        {referenceLesson &&
          (lecon?.has_concept ? (
            <Link to={`/revision-concept/${referenceLesson}`} className="card-link">
              <div className="card" style={{ textAlign: "center", fontWeight: 600, fontSize: "1.1em" }}>
                Le concept du jour
              </div>
            </Link>
          ) : (
            <div
              className="card"
              style={{ textAlign: "center", fontWeight: 600, fontSize: "1.1em", opacity: 0.5, cursor: "default" }}
              aria-disabled="true"
            >
              Le concept du jour
            </div>
          ))}
        {referenceLesson &&
          (lecon?.has_oral_questions ? (
            <Link to={`/comprehension-orale/${referenceLesson}`} className="card-link">
              <div className="card" style={{ textAlign: "center", fontWeight: 600, fontSize: "1.1em" }}>
                Compréhension orale
              </div>
            </Link>
          ) : (
            <div
              className="card"
              style={{ textAlign: "center", fontWeight: 600, fontSize: "1.1em", opacity: 0.5, cursor: "default" }}
              aria-disabled="true"
            >
              Compréhension orale
            </div>
          ))}
        {referenceLesson && (
          <Link to={`/revision-prof/${referenceLesson}`} className="card-link">
            <div className="card" style={{ textAlign: "center", fontWeight: 600, fontSize: "1.1em" }}>
              Les nouveaux items du jour
            </div>
          </Link>
        )}

        {/* Pas de marginTop supplémentaire : le gap:12px de .tile-list
            suffit déjà, un ajout ici cassait l'uniformité des écarts entre
            tuiles consécutives — cf. demande explicite du user. */}
        {referenceLesson && (
          <Link to={`/jdr/${referenceLesson}`} className="card-link">
            <div className="card" style={{ textAlign: "center", fontWeight: 600, fontSize: "1.1em" }}>
              Jeu de rôle
            </div>
          </Link>
        )}
      </div>
    </section>
  );
}
