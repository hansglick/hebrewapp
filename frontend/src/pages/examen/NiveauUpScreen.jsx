import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getOnboardingStatus } from "../../api/onboarding";
import { getExamenHardStatus } from "../../api/content";
import { useWallet } from "../../context/WalletContext";
import { ShekelIcon } from "../../components/ShekelIcon";
import { displayChapitreLabel } from "../../utils/chapitreDisplay";
import { displayLessonNumber } from "../../utils/lessonDisplay";
import { celebrateNiveauUp } from "./niveauUpAnimation";
import "../screens.css";

// Écran de célébration affiché quand un examen classique fait monter de
// niveau (finalResult.niveau_updated, cf. ExamenBilanScreen) — récap des
// gains, rappel de la boutique de cartes, proposition du Hard Exam.
export function NiveauUpScreen({ code, finalResult }) {
  const navigate = useNavigate();
  const { wallet, refreshWallet } = useWallet();
  const [pseudo, setPseudo] = useState(null);
  const [hardStatus, setHardStatus] = useState(null);
  const gainsCardRef = useRef(null);
  const chapId = code.split(".")[0];

  useEffect(() => {
    getOnboardingStatus().then((s) => setPseudo(s.pseudo));
    getExamenHardStatus().then(setHardStatus);
    // Le poll périodique du header n'est pas immédiat : on force un
    // rafraîchissement pour être sûr de refléter les points tout juste crédités.
    refreshWallet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Confettis + pièces volantes déclenchés au tout premier scroll OU
  // déplacement de souris sur cet écran (jamais au montage direct), une
  // seule fois — cf. demande explicite du user. `touchstart` est
  // indispensable sur mobile : un écran tactile ne déclenche jamais
  // "mousemove", et "scroll" ne se déclenche que si l'écran est assez long
  // pour défiler — sans lui, l'animation ne se lançait donc jamais sur
  // mobile (constaté par le user).
  useEffect(() => {
    let fired = false;
    function trigger() {
      if (fired) return;
      fired = true;
      window.removeEventListener("scroll", trigger);
      window.removeEventListener("mousemove", trigger);
      window.removeEventListener("touchstart", trigger);
      celebrateNiveauUp(gainsCardRef.current, Math.round(finalResult.points_gagnes ?? 0));
    }
    window.addEventListener("scroll", trigger, { passive: true });
    window.addEventListener("mousemove", trigger);
    window.addEventListener("touchstart", trigger, { passive: true });
    return () => {
      window.removeEventListener("scroll", trigger);
      window.removeEventListener("mousemove", trigger);
      window.removeEventListener("touchstart", trigger);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="screen">
      {/* Seuls le pseudo et le niveau atteint sont en gras, cf. demande
          explicite du user — le h1 lui-même repasse donc en graisse normale. */}
      <h1 style={{ textAlign: "center", fontWeight: 400 }}>
        Félicitations {pseudo && <strong style={{ fontWeight: 600 }}>{pseudo}</strong>}, tu atteins le niveau{" "}
        <strong style={{ fontWeight: 600 }}>
          {displayChapitreLabel(chapId)} {displayLessonNumber(code)}
        </strong>{" "}
        !
      </h1>

      <div ref={gainsCardRef} className="card" style={{ textAlign: "start", width: "100%", maxWidth: 320 }}>
        <p style={{ margin: 0, fontWeight: 600, color: "var(--text)" }}>Tes gains :</p>
        <ul
          style={{
            margin: "4px 0 0",
            paddingInlineStart: "1.2em",
            color: "var(--textMuted)",
            fontSize: "0.85em",
          }}
        >
          <li>
            {/* Gains de l'examen : gras + vert, cf. demande explicite du user. */}
            <strong style={{ color: "var(--success)" }}>
              + {Math.round(finalResult.points_gagnes ?? 0)}{" "}
              <ShekelIcon size={12} style={{ verticalAlign: -1 }} color="var(--success)" />
            </strong>{" "}
            gagnés à l'instant
          </li>
          {wallet && (
            <>
              <li>
                {/* Total actuel : vert (pas gras), cf. demande explicite du user. */}
                <span style={{ color: "var(--success)" }}>
                  {Math.round(wallet.points)} <ShekelIcon size={12} style={{ verticalAlign: -1 }} color="var(--success)" />
                </span>{" "}
                au total
              </li>
              <li>{wallet.nombre_cartes} carte(s) dans ta collection</li>
            </>
          )}
        </ul>
      </div>

      <p className="muted" style={{ fontSize: "0.8em", textAlign: "center", maxWidth: 320 }}>
        Échange tes points contre des cartes dans{" "}
        <Link to="/jeu/lotterie" className="link-btn" style={{ fontSize: "1em" }}>
          la boutique de lots
        </Link>
        .
      </p>

      {hardStatus?.unlocked && (
        <div className="card" style={{ textAlign: "start", width: "100%", maxWidth: 320 }}>
          <p style={{ margin: 0, fontWeight: 600, color: "var(--text)" }}>Envie d'un défi ?</p>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.85em", fontStyle: "italic" }}>
            Le Hard Exam regroupe les {hardStatus.total_questions} questions les plus difficiles pour toi
            (chronométré, {hardStatus.timer_minutes} min, un seul essai) — à gagner :{" "}
            {hardStatus.points_a_gagner} <ShekelIcon size={12} style={{ verticalAlign: -1 }} />. Disponible
            seulement jusqu'à ta prochaine réussite d'un examen classique.
          </p>
          <Link to="/examen/hard" className="link-btn" style={{ marginTop: 6, display: "inline-block" }}>
            Découvrir le Hard Exam
          </Link>
        </div>
      )}

      <button
        type="button"
        className="exam-tile green"
        style={{ cursor: "pointer" }}
        onClick={() => navigate("/")}
      >
        Prochaine leçon
      </button>
    </section>
  );
}
