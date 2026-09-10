import { useEffect, useState } from "react";
import { getEvaluationStats } from "../api/user";

const TOOLTIP_TEXT = "Performance de l'étudiant sur les 10 dernières évaluations";

// % de bonnes réponses sur les 10 dernières évaluations du type d'item en
// cours (tous items confondus), affiché sous le dernier trait horizontal,
// justifié à droite — cf. demande explicite du user. Avant que 10
// évaluations existent, affiche un compteur de progression ("x/10") plutôt
// que rien. Même gris que le trait (var(--cardBorder)). Tooltip au survol
// (desktop) et au clic (mobile, pas de survol) — cf. demande explicite du
// user. Pas d'attribut title (tooltip natif du navigateur) : il reste
// affiché tant que la souris ne bouge pas, indépendamment de tout clic —
// impossible à refermer par un clic, cf. bug rapporté par le user. Le
// survol/clic pilotent donc le même bloc custom ci-dessous. Ne se
// positionne PAS elle-même (pas de width) : l'écran appelant les fournit,
// cf. MotScreen/VerbeScreen/QuizzScreen.
const LIMIT = 10;

// Cache module-level (hors composant, survit aux montages/démontages) : les
// écrans révisions (Mot/Verbe/Quizz) remontent une INSTANCE FRAÎCHE de
// PerfStat à chaque "suivant" pour la page sortante de l'animation
// "tourner la page" (cf. PageTurnCurl) — sans cache, cette instance neuve
// démarre à stats=null et affiche un blanc le temps de sa propre requête,
// ce qui donne l'impression que la stat "disparaît" à chaque clic sur
// suivant — cf. bug rapporté par le user. Avec ce cache, un nouveau
// montage part directement de la dernière valeur connue (même objectType),
// sans attendre sa propre requête.
const statsCache = {};

export function PerfStat({ objectType, refreshKey }) {
  const [stats, setStats] = useState(() => statsCache[objectType] ?? null);
  const [showTip, setShowTip] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStats(statsCache[objectType] ?? null);
    getEvaluationStats({ objectType, limit: LIMIT }).then((s) => {
      statsCache[objectType] = s;
      if (!cancelled) setStats(s);
    });
    return () => {
      cancelled = true;
    };
  }, [objectType, refreshKey]);

  if (!stats) return null;

  const ready = stats.percent !== null;

  return (
    <div style={{ position: "relative" }}>
      <p
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
        onClick={() => setShowTip((v) => !v)}
        style={{ margin: 0, textAlign: "right", color: "var(--cardBorder)", fontWeight: 400, cursor: "pointer" }}
      >
        {ready ? (
          <>
            <span style={{ fontSize: "1.2em" }}>{stats.percent}</span>
            {/* "%" plus petit que la valeur, avec un espace avant — cf.
                demande explicite du user. */}
            <span style={{ fontSize: "0.7em" }}> %</span>
          </>
        ) : (
          <span>
            {stats.count}/{LIMIT}
          </span>
        )}
      </p>
      {/* Desktop : affiché au survol (onMouseEnter/Leave). Mobile (pas de
          survol) : le clic bascule cet affichage — cf. demande explicite
          du user. */}
      {showTip && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            padding: "8px 12px",
            borderRadius: 8,
            background: "var(--textPrimary)",
            color: "var(--bg)",
            fontSize: "0.75em",
            fontWeight: 400,
            whiteSpace: "normal",
            width: "max-content",
            maxWidth: 220,
            zIndex: 10,
          }}
        >
          {TOOLTIP_TEXT}
        </div>
      )}
    </div>
  );
}
