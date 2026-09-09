import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getExamenCopies } from "../../api/content";
import { displayLessonCode } from "../../utils/lessonDisplay";
import "../screens.css";

const FORMAT_LABELS = { ecrit: "Écrit", oral: "Oral" };
const TYPE_LABELS = { rapide: "Rapide", long: "Long", tres_long: "Très long" };

const th = { textAlign: "start", padding: "4px 8px", borderBottom: "1px solid var(--cardBorder)" };
const td = { padding: "6px 8px", borderBottom: "1px solid var(--cardBorder)" };

// "Revoir mes copies" (tuile rouge de LibraryLeconDetailScreen) — toutes
// les copies (écrit ET oral, une leçon pouvant avoir été passée plusieurs
// fois) associées à CETTE leçon uniquement, cf. demande explicite du user.
// Même source de données que ExamenCopiesListScreen (toutes les copies du
// user), simplement filtrée côté client par code de leçon — pas de colonne
// "Code" ici, déjà donné par le contexte.
export default function LibraryCopiesScreen() {
  const { code } = useParams();
  const [copies, setCopies] = useState(null);

  useEffect(() => {
    getExamenCopies().then(setCopies);
  }, []);

  if (!copies) return null;

  const forLesson = copies.filter((c) => c.code === code);

  return (
    <section className="screen" style={{ alignItems: "stretch" }}>
      <h1 style={{ textAlign: "center" }}>Mes copies — {displayLessonCode(code)}</h1>

      {forLesson.length === 0 ? (
        <p className="muted" style={{ textAlign: "center" }}>
          Aucune copie pour cette leçon.
        </p>
      ) : (
        <div style={{ width: "100%", overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.85em" }}>
            <thead>
              <tr>
                <th style={th}>Copie</th>
                <th style={th}>Date</th>
                <th style={th}>Format</th>
                <th style={th}>Type</th>
                <th style={th}>Note moyenne</th>
                <th style={th}>Réponses ≥4★</th>
              </tr>
            </thead>
            <tbody>
              {forLesson.map((c) => (
                <tr key={c.id}>
                  <td style={td}>
                    <Link to={`/examen/copies/${c.id}`} className="link-btn">
                      #{c.id}
                    </Link>
                  </td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{c.date.split(" ")[0]}</td>
                  <td style={td}>{FORMAT_LABELS[c.format]}</td>
                  <td style={td}>{TYPE_LABELS[c.exam_type]}</td>
                  <td style={td}>{c.average_note.toFixed(1)} / 5</td>
                  <td style={td}>{Math.round(c.success_ratio * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
