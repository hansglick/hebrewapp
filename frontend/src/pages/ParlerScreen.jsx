import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getNiveau } from "../api/user";
import { getLecon } from "../api/content";
import { TileTitle } from "../components/TileTitle";
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
      {/* .card partage déjà width:100%/max-width:320px avec .tile-list
          (screens.css) — même largeur que les tuiles ci-dessous ; fond/
          bordure rendus invisibles — cf. demande explicite du user. */}
      <div className="card" style={{ background: "transparent", border: "none", textAlign: "center" }}>
        {/* -33% (2em * 0.67 = 1.34em), non gras — cf. demande explicite du
            user. */}
        <h1 style={{ margin: 0, fontSize: "0.938em", fontWeight: 400, fontStyle: "italic" }}>
          Pratique l'hébreu oralement à travers des révisions et des jeux immersifs!
        </h1>
      </div>
      <div className="tile-list">
        {/* Avant "Compréhension" — cf. demande explicite du user. Grisée
            (non cliquable) si la leçon n'introduit aucun concept
            grammatical (item_concept.json, champ "presence"), même
            gating que "Compréhension" ci-dessous. */}
        {referenceLesson &&
          (lecon?.has_concept ? (
            <Link to={`/revision-concept/${referenceLesson}`} className="card-link">
              <div className="card" style={{ textAlign: "center" }}>
                <TileTitle src="/ampoule.png" gap={20}>Concept du jour</TileTitle>
              </div>
            </Link>
          ) : (
            <div className="card" style={{ textAlign: "center", opacity: 0.5, cursor: "default" }} aria-disabled="true">
              <TileTitle src="/ampoule.png" gap={20}>Concept du jour</TileTitle>
            </div>
          ))}
        {/* Ordre : concept du jour, items du jour, compréhension orale, jeu
            de rôle — cf. demande explicite du user. */}
        {referenceLesson && (
          <Link to={`/revision-prof/${referenceLesson}`} className="card-link">
            <div className="card" style={{ textAlign: "center" }}>
              <TileTitle src="/alefletter.png" gap={20}>Items du jour</TileTitle>
            </div>
          </Link>
        )}
        {referenceLesson &&
          (lecon?.has_oral_questions ? (
            <Link to={`/comprehension-orale/${referenceLesson}`} className="card-link">
              <div className="card" style={{ textAlign: "center" }}>
                <TileTitle src="/noiselogo.svg" gap={20}>Compréhension orale</TileTitle>
              </div>
            </Link>
          ) : (
            <div className="card" style={{ textAlign: "center", opacity: 0.5, cursor: "default" }} aria-disabled="true">
              <TileTitle src="/noiselogo.svg" gap={20}>Compréhension orale</TileTitle>
            </div>
          ))}

        {/* Pas de marginTop supplémentaire : le gap:12px de .tile-list
            suffit déjà, un ajout ici cassait l'uniformité des écarts entre
            tuiles consécutives — cf. demande explicite du user. */}
        {referenceLesson && (
          <Link to={`/jdr/${referenceLesson}`} className="card-link">
            <div className="card" style={{ textAlign: "center" }}>
              {/* Étoile dorée à bordure noire, coin haut droit — même
                  forme/couleur/position relative que sur la tuile "Parler"
                  de l'accueil (cf. Accueil.jsx) — cf. demande explicite du
                  user. */}
              <svg
                viewBox="0 0 20 20"
                width={20}
                height={20}
                style={{ position: "absolute", top: -8, right: -8 }}
              >
                <polygon
                  points="10,1 12.9,7.6 20,8.1 14.5,12.9 16.2,20 10,16.2 3.8,20 5.5,12.9 0,8.1 7.1,7.6"
                  fill="#ffd700"
                  stroke="#000"
                  strokeWidth="1"
                  strokeLinejoin="round"
                />
              </svg>
              <TileTitle src="/role.png" gap={20}>Jeu de rôle</TileTitle>
            </div>
          </Link>
        )}
      </div>
    </section>
  );
}
