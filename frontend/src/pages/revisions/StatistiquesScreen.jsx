import { useEffect, useState } from "react";
import { getStats, getRecencyStats } from "../../api/content";
import "../screens.css";

const TABS = [
  { key: "mot", label: "Mot" },
  { key: "verbe", label: "Verbe" },
  { key: "traduction.fr", label: "Traduction FR" },
  { key: "traduction.he", label: "Traduction HE" },
  { key: "quizz", label: "Quizz" },
  { key: "oral", label: "Orale" },
  { key: "recence", label: "Récence" },
];

// Toujours 5 pastilles : celles manquantes (évaluations pas encore faites)
// sont des pastilles grises placées à gauche, puisque les vraies évaluations
// sont déjà ordonnées de la plus ancienne (gauche) à la plus récente (droite).
function Pastilles({ evaluations }) {
  const missing = Math.max(0, 5 - evaluations.length);
  return (
    <span style={{ display: "inline-flex", gap: 3 }}>
      {Array.from({ length: missing }).map((_, i) => (
        <span
          key={`missing-${i}`}
          style={{
            display: "inline-block",
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "var(--border)",
          }}
        />
      ))}
      {evaluations.map((success, i) => (
        <span
          key={i}
          style={{
            display: "inline-block",
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: success ? "var(--success)" : "var(--danger)",
          }}
        />
      ))}
    </span>
  );
}

const th = { textAlign: "start", padding: "4px 8px", borderBottom: "1px solid var(--border)" };
const td = { padding: "6px 8px", borderBottom: "1px solid var(--border)" };

function DifficultyTable({ rows, showReadinessColumn }) {
  return (
    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.85em" }}>
      <thead>
        <tr>
          <th style={th}>#</th>
          <th style={th}>Contenu</th>
          <th style={th}>Leçon</th>
          <th style={th}>5 dernières</th>
          <th style={th}>Difficulté</th>
          {showReadinessColumn && <th style={th}>Utilisé pour le calcul</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.object_key}>
            <td style={td}>{row.rank}</td>
            <td style={{ ...td, maxWidth: 220 }}>
              {row.verb ? (
                <>
                  {row.verb}{" "}
                  <span style={{ fontStyle: "italic", fontSize: "0.85em", color: "var(--textMuted)" }}>
                    ({row.temps}, {row.personne})
                  </span>
                </>
              ) : (
                row.content
              )}
            </td>
            <td style={{ ...td, whiteSpace: "nowrap" }}>
              {row.chapter}.{row.lesson}
            </td>
            <td style={td}>
              <Pastilles evaluations={row.last_evaluations} />
            </td>
            <td style={td}>{row.difficulty.toFixed(2)}</td>
            {showReadinessColumn && (
              <td style={{ ...td, textAlign: "center" }}>{row.used_in_readiness ? "✓" : ""}</td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RecencyTable({ rows }) {
  return (
    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.85em" }}>
      <thead>
        <tr>
          <th style={th}>#</th>
          <th style={th}>Type</th>
          <th style={th}>Objet</th>
          <th style={th}>Leçon</th>
          <th style={th}>Leçons vues</th>
          <th style={th}>Poids de récence</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.object_key}>
            <td style={td}>{row.rank}</td>
            <td style={td}>{row.type}</td>
            <td style={{ ...td, maxWidth: 220 }}>{row.content}</td>
            <td style={{ ...td, whiteSpace: "nowrap" }}>
              {row.chapter}.{row.lesson}
            </td>
            <td style={td}>{row.lessons_seen}</td>
            <td style={td}>{row.recency_weight}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function StatistiquesScreen() {
  const [tab, setTab] = useState("mot");
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    const fetcher = tab === "recence" ? getRecencyStats() : getStats(tab);
    fetcher.then((data) => {
      // Ignore une réponse arrivée après qu'on ait déjà changé d'onglet —
      // sinon une requête "récence" plus lente peut écraser les lignes du
      // nouvel onglet avec des données au mauvais format (page blanche).
      if (!cancelled) setRows(data);
    });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  return (
    <section className="screen" style={{ alignItems: "stretch" }}>
      <h1 style={{ textAlign: "center" }}>Tes erreurs</h1>
      <p className="muted" style={{ textAlign: "center", fontStyle: "italic", fontSize: "0.85em" }}>
        Les items proposés en révision sont tirés au sort selon deux critères : la récence de la
        leçon et la difficulté que tu rencontres sur chaque item.
      </p>

      <div className="toggle-group" style={{ justifyContent: "center", flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={tab === t.key ? "active" : ""}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {rows === null && <p className="muted" style={{ textAlign: "center" }}>Chargement...</p>}

      {rows && rows.length === 0 && (
        <p className="muted" style={{ textAlign: "center" }}>
          {tab === "recence"
            ? "Aucune leçon débloquée pour l'instant."
            : "Aucune évaluation enregistrée pour cet objet."}
        </p>
      )}

      {rows && rows.length > 0 && (
        <div style={{ width: "100%", overflowX: "auto" }}>
          {tab === "recence" ? (
            <RecencyTable rows={rows} />
          ) : (
            <DifficultyTable rows={rows} showReadinessColumn={tab === "traduction.he"} />
          )}
        </div>
      )}
    </section>
  );
}
