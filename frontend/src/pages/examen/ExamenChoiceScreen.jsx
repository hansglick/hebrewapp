import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getExamenHardStatus } from "../../api/content";
import { getNiveau } from "../../api/user";
import { ShekelIcon } from "../../components/ShekelIcon";
import "../screens.css";

export default function ExamenChoiceScreen() {
  const navigate = useNavigate();
  const [niveau, setNiveau] = useState(null);
  const [hardStatus, setHardStatus] = useState(null);

  useEffect(() => {
    getNiveau().then(setNiveau);
    getExamenHardStatus().then(setHardStatus);
  }, []);

  const nextCode = niveau?.next_lesson_code;
  const hardUnlocked = hardStatus?.unlocked;

  return (
    <section className="screen">
      <h1>Examen</h1>
      <div className="tile-list">
        {nextCode ? (
          <Link to={`/examen/cible/${nextCode}`} className="card-link">
            <div className="card">Passer l'examen suivant</div>
          </Link>
        ) : (
          <div className="card" style={{ opacity: 0.5 }}>
            {niveau ? "Dernier niveau du cours atteint" : "Passer l'examen suivant"}
          </div>
        )}
        <Link to="/examen/sauter" className="card-link">
          <div className="card">Demander une équivalence ou repasser un examen réussi</div>
        </Link>
        <button
          type="button"
          className={`exam-tile ${hardUnlocked ? "green" : "grey"}`}
          style={hardUnlocked ? { cursor: "pointer" } : undefined}
          disabled={!hardUnlocked}
          onClick={hardUnlocked ? () => navigate("/examen/hard") : undefined}
        >
          Hard Exam
          <span className="exam-tile-tooltip">
            {hardUnlocked ? (
              <>
                Passer le hard examen est une occasion d'accumuler un maximum de{" "}
                <ShekelIcon size={12} style={{ verticalAlign: -1 }} /> !
              </>
            ) : (
              "Le hard examen sera débloquée la prochaine fois que vous réussirez un examen"
            )}
          </span>
        </button>
        <Link to="/examen/statistiques" className="card-link">
          <div className="card">Progression</div>
        </Link>
        <Link to="/examen/copies" className="card-link">
          <div className="card">Mes copies</div>
        </Link>
      </div>
    </section>
  );
}
