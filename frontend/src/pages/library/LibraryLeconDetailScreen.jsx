import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getLecon, getExamenCopies } from "../../api/content";
import { displayLessonNumber } from "../../utils/lessonDisplay";
import { displayChapitreLabel } from "../../utils/chapitreDisplay";
import "../screens.css";

// Hauteur partagée par les 6 tuiles "pleines" (Texte/Vocabulaire/Verbes/
// Phrases/2 Conversations) — "Repasser l'examen" reçoit exactement la
// moitié, cf. demande explicite du user.
const TILE_HEIGHT = 64;
const EXAM_TILE_HEIGHT = TILE_HEIGHT / 2;

const tileStyle = (background, height = TILE_HEIGHT, color = "#fff") => ({
  textAlign: "center",
  height,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background,
  color,
  border: "none",
  fontWeight: 600,
  fontSize: "1.1em",
});

// Écran "curé" atteint depuis la Bibliothèque (chapitres déjà atteints ->
// leçons débloquées -> cette leçon) : uniquement les items sur lesquels on
// peut réviser une leçon déjà passée, plus le PDF (tuile grise discrète en
// toute fin de liste) — pas la Curiosité, contrairement à LeconDetailScreen
// (apprentissage/exploration en cours) — cf. demande explicite du user.
// Chaque tuile pointe vers l'écran générique habituel (mode exploration,
// piloté par le :code de l'URL, identique quelle que soit la leçon) —
// aucun nouvel écran de contenu, juste un nouveau point d'accès.
export default function LibraryLeconDetailScreen() {
  const { chapId, code } = useParams();
  const [lecon, setLecon] = useState(null);
  const [hasCopies, setHasCopies] = useState(null);

  useEffect(() => {
    getLecon(code).then(setLecon);
  }, [code]);

  // Détermine si l'étudiant a déjà passé un examen (écrit ou oral) associé
  // à CETTE leçon — sinon la tuile "Revoir mes copies" est grisée (rouge
  // pastel) et non cliquable : possible si des leçons ont été sautées, ou
  // si le test de placement de l'onboarding a propulsé le user plus haut
  // que 0.00 sans qu'il ait réellement passé les examens intermédiaires —
  // cf. demande explicite du user.
  useEffect(() => {
    getExamenCopies().then((copies) => setHasCopies(copies.some((c) => c.code === code)));
  }, [code]);

  if (!lecon) return null;

  return (
    <section className="screen">
      <h1>
        {displayChapitreLabel(chapId)}.{displayLessonNumber(code)}
      </h1>

      <div className="tile-list">
        {lecon.text && (
          <Link to={`/apprentissage/${chapId}/${code}/texte`} className="card-link">
            {/* Bleu — cf. demande explicite du user. */}
            <div className="card" style={tileStyle("#2563eb")}>
              Texte
            </div>
          </Link>
        )}

        {lecon.words.length > 0 && (
          <Link to={`/apprentissage/${chapId}/${code}/mots`} className="card-link">
            {/* Vert — cf. demande explicite du user. */}
            <div className="card" style={tileStyle("var(--validationPleine)")}>
              Vocabulaire
            </div>
          </Link>
        )}

        {lecon.verbs.length > 0 && (
          <Link to={`/apprentissage/${chapId}/${code}/verbes`} className="card-link">
            <div className="card" style={tileStyle("var(--validationPleine)")}>
              Verbes
            </div>
          </Link>
        )}

        {lecon.phrases && (
          <Link to={`/apprentissage/${chapId}/${code}/questions-ecrites`} className="card-link">
            <div className="card" style={tileStyle("var(--validationPleine)")}>
              Phrases
            </div>
          </Link>
        )}

        {/* Orange (comme les 2 conversations plus bas), mais orange
            PASTEL/grisée et non cliquable si la leçon n'a pas de questions
            orales associées (cf. lecon.has_oral_questions, backend) — cf.
            demande explicite du user. Positionnée juste après "Phrases",
            avant les 2 tuiles "Conversation" — cf. demande explicite du
            user. */}
        {lecon.has_oral_questions ? (
          <Link to={`/comprehension-orale/${code}`} className="card-link">
            <div className="card" style={tileStyle("#f97316")}>
              Compréhension orale
            </div>
          </Link>
        ) : (
          <div className="card" style={{ ...tileStyle("#fed7aa"), cursor: "default" }} aria-disabled="true">
            Compréhension orale
          </div>
        )}

        <Link to={`/revision-prof/${code}`} className="card-link">
          {/* Orange — cf. demande explicite du user. */}
          <div className="card" style={tileStyle("#f97316")}>
            Conversation "Révision des items"
          </div>
        </Link>

        <Link to={`/jdr/${code}`} className="card-link">
          <div className="card" style={tileStyle("#f97316")}>
            Conversation "Jeu de rôles"
          </div>
        </Link>

        <Link to={`/examen/cible/${code}`} className="card-link">
          {/* Rouge, hauteur moitié des autres tuiles — cf. demande
              explicite du user. */}
          <div className="card" style={tileStyle("var(--annulationPleine)", EXAM_TILE_HEIGHT)}>
            Repasser l'examen
          </div>
        </Link>

        {/* Rouge (comme "Repasser l'examen"), mais rouge PASTEL/grisée et
            non cliquable tant qu'aucune copie n'existe pour cette leçon
            (hasCopies === null pendant le chargement -> pas encore de
            rendu tranché, cf. tileStyle par défaut plein le temps du
            fetch). Même format (largeur/hauteur) que "Repasser l'examen" —
            cf. demande explicite du user. */}
        {hasCopies ? (
          <Link to={`/library/${chapId}/${code}/copies`} className="card-link">
            <div className="card" style={tileStyle("var(--annulationPleine)", EXAM_TILE_HEIGHT)}>
              Revoir mes copies
            </div>
          </Link>
        ) : (
          <div
            className="card"
            style={{ ...tileStyle("var(--annulationGrisee)", EXAM_TILE_HEIGHT), cursor: "default" }}
            aria-disabled="true"
          >
            Revoir mes copies
          </div>
        )}

        <Link to={`/apprentissage/${chapId}/${code}/pdf`} className="card-link">
          {/* Gris clair, écriture noire — cf. demande explicite du user. */}
          <div className="card" style={tileStyle("#d1d5db", TILE_HEIGHT, "#000")}>
            PDF
          </div>
        </Link>
      </div>
    </section>
  );
}
