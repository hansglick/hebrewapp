import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getExamenCopies } from "../../api/content";
import { displayLessonCode } from "../../utils/lessonDisplay";
import "../screens.css";

const FORMAT_LABELS = { ecrit: "Écrit", oral: "Oral" };
const TYPE_LABELS = { rapide: "Rapide", long: "Long", tres_long: "Très long" };

const th = { textAlign: "start", padding: "4px 8px", borderBottom: "1px solid var(--border)" };
const td = { padding: "6px 8px", borderBottom: "1px solid var(--border)" };

export default function ExamenCopiesListScreen() {
  const [copies, setCopies] = useState(null);

  useEffect(() => {
    getExamenCopies().then(setCopies);
  }, []);

  if (!copies) return null;

  return (
    <section className="screen" style={{ alignItems: "stretch" }}>
      <h1 style={{ textAlign: "center" }}>Mes copies</h1>

      {copies.length === 0 ? (
        <p className="muted" style={{ textAlign: "center" }}>
          Aucune copie pour l'instant.
        </p>
      ) : (
        <div style={{ width: "100%", overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.85em" }}>
            <thead>
              <tr>
                <th style={th}>Copie</th>
                <th style={th}>Date</th>
                <th style={th}>Code</th>
                <th style={th}>Format</th>
                <th style={th}>Type</th>
                <th style={th}>Note moyenne</th>
                <th style={th}>Réponses ≥4★</th>
              </tr>
            </thead>
            <tbody>
              {copies.map((c) => (
                <tr key={c.id}>
                  <td style={td}>
                    <Link to={`/examen/copies/${c.id}`} className="link-btn">
                      #{c.id}
                    </Link>
                  </td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{c.date.split(" ")[0]}</td>
                  <td style={td}>{displayLessonCode(c.code)}</td>
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
