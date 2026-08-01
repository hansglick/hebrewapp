import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getLecons } from "../../api/content";
import "../screens.css";

export default function LeconsListScreen() {
  const { chapId } = useParams();
  const [lecons, setLecons] = useState([]);

  useEffect(() => {
    getLecons(chapId).then(setLecons);
  }, [chapId]);

  return (
    <section className="screen">
      <h1>Chapitre {chapId}</h1>
      <div className="tile-list">
        {lecons.map((lecon) => (
          <Link
            key={lecon.code}
            to={`/apprentissage/${chapId}/${lecon.code}`}
            className="card-link"
          >
            <div className="card">
              {lecon.code}
              {lecon.titre_texte ? ` — ${lecon.titre_texte}` : ""}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
