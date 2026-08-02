import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getLecons } from "../../api/content";
import { getNiveau } from "../../api/user";
import "../screens.css";

export default function LeconsListScreen() {
  const { chapId } = useParams();
  const [lecons, setLecons] = useState([]);
  const [niveau, setNiveau] = useState(null);

  useEffect(() => {
    getLecons(chapId).then(setLecons);
  }, [chapId]);

  useEffect(() => {
    getNiveau().then(setNiveau);
  }, []);

  return (
    <section className="screen">
      <h1>Chapitre {chapId}</h1>
      <div className="tile-list">
        {lecons.map((lecon) => {
          const unlocked = !niveau || lecon.code <= niveau.level;
          const label = `${lecon.code}${lecon.titre_texte ? ` — ${lecon.titre_texte}` : ""}`;
          return unlocked ? (
            <Link
              key={lecon.code}
              to={`/apprentissage/${chapId}/${lecon.code}`}
              className="card-link"
            >
              <div className="card">{label}</div>
            </Link>
          ) : (
            <div key={lecon.code} className="card" style={{ opacity: 0.5 }}>
              🔒 {label}
            </div>
          );
        })}
      </div>
    </section>
  );
}
