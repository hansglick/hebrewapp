import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getChapitres, getLecons } from "../../api/content";
import "../screens.css";

export default function ExamenLeconPickerScreen({ examType = "ecrite" }) {
  const [groups, setGroups] = useState([]);

  useEffect(() => {
    getChapitres().then(async (chapitres) => {
      const result = [];
      for (const chap of chapitres) {
        const lecons = await getLecons(chap.id);
        result.push({ chapId: chap.id, titre: chap.titre, lecons });
      }
      setGroups(result);
    });
  }, []);

  return (
    <section className="screen">
      <h1>Choisir un examen</h1>
      {groups.map((g) => (
        <div key={g.chapId} style={{ width: "100%", maxWidth: 320 }}>
          <p className="muted" style={{ margin: "16px 0 8px" }}>
            Chapitre {g.chapId} — {g.titre}
          </p>
          <div className="tile-list">
            {g.lecons.map((l) => (
              <Link key={l.code} to={`/examen/${examType}/${l.code}`} className="card-link">
                <div className="card">
                  {l.code}
                  {l.titre_texte ? ` — ${l.titre_texte}` : ""}
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
