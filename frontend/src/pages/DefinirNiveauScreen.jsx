import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getLecons } from "../api/content";
import { updateNiveau } from "../api/user";
import { displayLessonNumber } from "../utils/lessonDisplay";
import { ChapitreLabelWithLogo } from "../components/ChapitreLogo";
import "./screens.css";

// Leçons d'un chapitre (God Mode uniquement, cf. NiveauScreen) — contrairement
// à SauterLeconsScreen, TOUTES les leçons du chapitre sont affichées (pas de
// filtrage par niveau actuel : redéfinir son niveau doit aussi permettre de
// redescendre) et un clic redéfinit directement le niveau du user (au lieu
// de cibler l'examen de cette leçon), avant de retourner à l'accueil — cf.
// demande explicite du user.
export default function DefinirNiveauScreen() {
  const { chapId } = useParams();
  const navigate = useNavigate();
  const [lecons, setLecons] = useState([]);

  useEffect(() => {
    getLecons(chapId).then(setLecons);
  }, [chapId]);

  async function handlePick(code) {
    await updateNiveau(code);
    navigate("/");
  }

  return (
    <section className="screen">
      <h1>
        <ChapitreLabelWithLogo chapId={chapId} />
      </h1>
      <div className="tile-list">
        {lecons.map((lecon) => (
          <div key={lecon.code} className="card" style={{ cursor: "pointer" }} onClick={() => handlePick(lecon.code)}>
            {displayLessonNumber(lecon.code)}
          </div>
        ))}
      </div>
    </section>
  );
}
