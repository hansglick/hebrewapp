import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getLessonCuriosites } from "../../api/content";
import { CURIOSITE_CONFIG } from "../fun/curiositeConfig";
import "../screens.css";

// Nouveautés "curiosités" (proverbe/tanakh/récit/landmark/blague/expression/
// presse) débloquées précisément à cette leçon — une tuile par type ayant
// une nouveauté, vers CuriositeScreen filtré sur le delta de cette leçon.
export default function CuriositeListScreen() {
  const { chapId, code } = useParams();
  const [types, setTypes] = useState(null);

  useEffect(() => {
    getLessonCuriosites(code).then((data) => setTypes(data.types));
  }, [code]);

  if (!types) return null;

  return (
    <section className="screen">
      <h1>Curiosité</h1>
      <div className="tile-list">
        {types.map((type) => (
          <Link
            key={type}
            to={`/apprentissage/${chapId}/${code}/curiosite/${type}`}
            className="card-link"
          >
            <div className="card">{CURIOSITE_CONFIG[type]?.label ?? type}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
