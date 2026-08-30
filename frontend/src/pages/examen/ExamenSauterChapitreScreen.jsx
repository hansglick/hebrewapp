import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getLecons, getExamensSummary } from "../../api/content";
import { displayLessonCode, displayLessonNumber } from "../../utils/lessonDisplay";
import { displayChapitreLabel } from "../../utils/chapitreDisplay";
import "../screens.css";

const TYPE_COLORS = {
  rapide: "var(--success)",
  long: "var(--warning)",
  tres_long: "var(--danger)",
};

export default function ExamenSauterChapitreScreen() {
  const { chapId } = useParams();
  const [lecons, setLecons] = useState([]);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    getExamensSummary().then((data) => setSummary(data.exams));
    getLecons(chapId).then(setLecons);
  }, [chapId]);

  return (
    <section className="screen">
      <h1>{displayChapitreLabel(chapId)}</h1>
      <div className="tile-list">
        {lecons.map((l) => {
          const info = summary?.[l.code];
          const reussi = info?.ecrit_passed && info?.oral_passed;

          // La dernière leçon du chapitre précédent ("très long", cf.
          // lesson_order.exam_type_for) sert de porte d'entrée au chapitre
          // de cette leçon : impossible de sauter à n'importe quelle leçon
          // de ce chapitre (y compris sa propre première) tant qu'elle
          // n'est pas réussie dans les deux formats.
          const gate = info?.entry_gate;
          const gateInfo = gate ? summary?.[gate] : null;
          // `summary` pas encore chargé -> verrouillé par défaut (comme
          // avant), plutôt que de flasher un état déverrouillé le temps
          // que la réponse arrive.
          const gatePassed = summary != null && (!gate || (gateInfo?.ecrit_passed && gateInfo?.oral_passed));
          const locked = !gatePassed;

          const label = `${displayLessonNumber(l.code)}${l.titre_texte ? ` — ${l.titre_texte}` : ""}`;

          if (locked) {
            return (
              <div key={l.code} className="card card-row" style={{ opacity: 0.5 }}>
                <span>{label}</span>
                <span className="muted" style={{ fontStyle: "italic", fontSize: "0.75em" }}>
                  Réussis d'abord{" "}
                  {gate ? `${displayChapitreLabel(gate.split(".")[0])} - ` : ""}
                  {displayLessonCode(gate)}
                </span>
              </div>
            );
          }

          return (
            <Link
              key={l.code}
              to={`/examen/cible/${l.code}`}
              className="card-link"
              style={reussi ? { opacity: 0.5 } : undefined}
            >
              <div className="card card-row">
                <span>{label}</span>
                {info && !reussi && (
                  <span className="binyan-pill" style={{ backgroundColor: TYPE_COLORS[info.exam_type] }} />
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
