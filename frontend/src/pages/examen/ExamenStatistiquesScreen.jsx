import { useEffect, useState } from "react";
import { getExamenProgression } from "../../api/content";
import "../screens.css";

const WIDTH = 420;
const HEIGHT = 300;
const PAD_LEFT = 48;
const PAD_RIGHT = 20;
const PAD_TOP = 20;
const PAD_BOTTOM = 44;

function scaleX(t, minT, maxT) {
  if (maxT === minT) return (PAD_LEFT + (WIDTH - PAD_RIGHT)) / 2;
  return PAD_LEFT + ((t - minT) / (maxT - minT)) * (WIDTH - PAD_LEFT - PAD_RIGHT);
}

function scaleY(score, maxScore) {
  if (maxScore === 0) return HEIGHT - PAD_BOTTOM;
  return HEIGHT - PAD_BOTTOM - (score / maxScore) * (HEIGHT - PAD_TOP - PAD_BOTTOM);
}

function formatDate(value) {
  return new Date(value).toLocaleDateString("fr-FR");
}

// Chemin "en escalier" : plat entre deux montées de niveau (plateau tant que
// l'examen n'est pas réussi), puis marche verticale brutale à la réussite —
// prolongé jusqu'à aujourd'hui pour que le plateau courant reste visible.
function buildStepPath(points, minT, maxT, maxScore) {
  if (points.length === 0) return "";
  const extended = [...points, { t: maxT, score: points[points.length - 1].score }];
  let d = `M ${scaleX(extended[0].t, minT, maxT)} ${scaleY(extended[0].score, maxScore)}`;
  for (let i = 1; i < extended.length; i++) {
    const prev = extended[i - 1];
    const curr = extended[i];
    const xCurr = scaleX(curr.t, minT, maxT);
    const yPrev = scaleY(prev.score, maxScore);
    const yCurr = scaleY(curr.score, maxScore);
    d += ` L ${xCurr} ${yPrev} L ${xCurr} ${yCurr}`;
  }
  return d;
}

export default function ExamenStatistiquesScreen() {
  const [data, setData] = useState(null);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    getExamenProgression().then(setData);
  }, []);

  if (!data) return null;

  if (data.points.length === 0) {
    return (
      <section className="screen">
        <h1>Progression</h1>
        <p className="muted">Pas encore de progression enregistrée.</p>
      </section>
    );
  }

  const points = data.points.map((p) => ({ t: new Date(p.date).getTime(), score: p.score, date: p.date }));
  const now = Date.now();
  const minT = points[0].t;
  const maxT = Math.max(points[points.length - 1].t, now);
  const maxScore = Math.max(...points.map((p) => p.score), 1);

  const path = buildStepPath(points, minT, maxT, maxScore);

  function showTooltip(cx, cy, text) {
    setHovered({ leftPct: (cx / WIDTH) * 100, topPct: (cy / HEIGHT) * 100, text });
  }

  return (
    <section className="screen">
      <h1>Progression</h1>
      <p className="muted">Progression du niveau au fil du temps</p>
      <div style={{ width: "100%", maxWidth: 480, position: "relative" }}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%">
          {/* Axes */}
          <line x1={PAD_LEFT} y1={HEIGHT - PAD_BOTTOM} x2={WIDTH - PAD_RIGHT} y2={HEIGHT - PAD_BOTTOM} stroke="var(--border)" />
          <line x1={PAD_LEFT} y1={PAD_TOP} x2={PAD_LEFT} y2={HEIGHT - PAD_BOTTOM} stroke="var(--border)" />

          {/* Graduations min/max */}
          <text x={PAD_LEFT} y={HEIGHT - PAD_BOTTOM + 16} fontSize="10" fill="var(--textMuted)" textAnchor="start">
            {formatDate(minT)}
          </text>
          <text x={WIDTH - PAD_RIGHT} y={HEIGHT - PAD_BOTTOM + 16} fontSize="10" fill="var(--textMuted)" textAnchor="end">
            {formatDate(maxT)}
          </text>
          <text x={PAD_LEFT - 8} y={HEIGHT - PAD_BOTTOM} fontSize="10" fill="var(--textMuted)" textAnchor="end">
            0
          </text>
          <text x={PAD_LEFT - 8} y={PAD_TOP + 5} fontSize="10" fill="var(--textMuted)" textAnchor="end">
            {maxScore}
          </text>

          {/* Légendes des axes */}
          <text
            x={(PAD_LEFT + (WIDTH - PAD_RIGHT)) / 2}
            y={HEIGHT - 6}
            fontSize="12"
            fill="var(--textMuted)"
            textAnchor="middle"
          >
            Date
          </text>
          <text
            x={-HEIGHT / 2}
            y={14}
            fontSize="12"
            fill="var(--textMuted)"
            textAnchor="middle"
            transform="rotate(-90)"
          >
            Niveau (score)
          </text>

          <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" />

          {points.map((p, i) => {
            const cx = scaleX(p.t, minT, maxT);
            const cy = scaleY(p.score, maxScore);
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r="5"
                fill="var(--accent)"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => showTooltip(cx, cy, `Niveau atteint le ${formatDate(p.t)} — score ${p.score}`)}
                onMouseLeave={() => setHovered(null)}
              />
            );
          })}

          {data.failures.map((f, i) => {
            const cx = scaleX(new Date(f.date).getTime(), minT, maxT);
            const cy = scaleY(f.score, maxScore);
            const label = f.exam_type === "oral" ? "oral" : "écrit";
            return (
              <circle
                key={`fail-${i}`}
                cx={cx}
                cy={cy}
                r="5"
                fill={f.exam_type === "oral" ? "var(--danger)" : "var(--text)"}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => showTooltip(cx, cy, `Échec ${label} — ${formatDate(f.date)}`)}
                onMouseLeave={() => setHovered(null)}
              />
            );
          })}
        </svg>

        {hovered && (
          <div
            style={{
              position: "absolute",
              left: `${hovered.leftPct}%`,
              top: `${hovered.topPct}%`,
              transform: "translate(-50%, -130%)",
              background: "var(--text)",
              color: "var(--bg)",
              padding: "6px 10px",
              borderRadius: 8,
              fontSize: "0.8em",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              zIndex: 10,
            }}
          >
            {hovered.text}
          </div>
        )}
      </div>
      <p className="muted" style={{ fontSize: "0.8em" }}>
        <span style={{ color: "var(--text)" }}>●</span> échec écrit &nbsp;
        <span style={{ color: "var(--danger)" }}>●</span> échec oral
      </p>
    </section>
  );
}
